// Sessões HLS sob demanda, como o DynamicHlsController + TranscodeManager do Jellyfin 10.11.10:
//  - a playlist VOD sai completa na hora (segmentos alinhados aos keyframes no remux, iguais no transcode);
//  - cada segmento é gerado sob demanda: se já existe, é servido; se o pedido está atrás do FFmpeg em execução ou
//    mais de 24 s à frente, o FFmpeg é reiniciado naquele segmento (-ss, -copyts, -start_number), então pular
//    para qualquer ponto do filme não espera a conversão "chegar lá";
//  - segmentos fMP4 (init + .mp4), corte nos mesmos pontos da playlist;
//  - sessão parada (sem pedidos) é encerrada e apagada.
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MediaItem, MediaTechnicalInfo, PlaybackPlan } from "../types.js";
import type { Aceleracao } from "./aceleracao.js";
import type { CacheKeyframes } from "./keyframes.js";
import { iniciosDosSegmentos, playlistVod, segmentosIguais, segmentosPorKeyframes } from "./segmentos.js";

export const SEGUNDOS_POR_SEGMENTO = 6;
const SALTO_QUE_REINICIA_S = 24; // segmentGapRequiringTranscodingChange = 24 / SegmentLength
const ESPERA_MAXIMA_MS = 90_000;
const SESSAO_OCIOSA_MS = 3 * 60_000;

interface Trabalho { processo: ChildProcess; inicio: number; proximo: number; terminou: boolean; codigo: number | null; diagnostico: string; gpu: boolean }
interface Sessao {
  id: string; usuario: string; media: MediaItem; info: MediaTechnicalInfo; plano: PlaybackPlan;
  copiaVideo: boolean; duracoes: number[]; inicios: number[]; pasta: string;
  trabalho: Trabalho | null; ultimoAcesso: number; fila: Promise<unknown>;
  /** A GPU falhou nesta sessão: daqui em diante, software. */
  semGpu: boolean;
}

export interface OpcoesArgumentos {
  entrada: string; info: MediaTechnicalInfo; plano: PlaybackPlan; copiaVideo: boolean;
  segmento: number; inicioSegundos: number; pasta: string; ffmpegThreads?: number;
  /** GPU por VAAPI (null = software). */
  aceleracao?: Aceleracao | null;
}

/** A GPU converte este vídeo? Tone mapping e legenda em imagem continuam por software (como no caminho simples do Jellyfin). */
export function usaAceleracao(o: Pick<OpcoesArgumentos, "aceleracao" | "copiaVideo" | "plano" | "info">): boolean {
  const legenda = o.info.subtitleTracks.find(t => t.streamIndex === o.plano.subtitleStreamIndex);
  return Boolean(o.aceleracao) && !o.copiaVideo && !o.plano.toneMap && legenda?.kind !== "bitmap";
}

/** Linha de comando do FFmpeg para gerar os segmentos a partir de `segmento` (GetCommandLineArguments). */
export function argumentosFfmpeg(o: OpcoesArgumentos): string[] {
  const video = o.info.video!;
  const audio = o.info.audioTracks.find(t => t.streamIndex === o.plano.audioStreamIndex);
  const legenda = o.info.subtitleTracks.find(t => t.streamIndex === o.plano.subtitleStreamIndex);
  const args = ["-hide_banner", "-nostdin", "-loglevel", "warning"];
  const gpu = usaAceleracao(o) ? o.aceleracao! : null;
  // Decodifica na GPU quando ela lê o codec; senão decodifica no processador e envia os quadros para a GPU (hwupload).
  const decodificaNaGpu = Boolean(gpu?.decodifica.includes(video.codec));
  if (gpu && decodificaNaGpu) args.push("-hwaccel", "vaapi", "-hwaccel_device", gpu.dispositivo, "-hwaccel_output_format", "vaapi");
  else if (gpu) args.push("-init_hw_device", `vaapi=va:${gpu.dispositivo}`, "-filter_hw_device", "va");
  // No remux, o -ss na entrada cai no keyframe anterior ao ponto de busca, e o FFmpeg recua sozinho 3/23 s (~0,13 s)
  // antes de buscar quando o vídeo tem quadros B (fftools/ffmpeg_demux.c, "dts_heuristic"). Pedir o tempo exato do
  // keyframe caía no keyframe ANTERIOR e o segmento N saía com o conteúdo do N-1: o player via buraco e pulava ou
  // travava (medido no FFmpeg 8 do container: -ss 302,084 → 291,667; -ss 303 → 302,083). 0,25 s depois do keyframe
  // compensa o recuo e ainda fica antes do keyframe seguinte (sempre a mais de 1 s).
  if (o.inicioSegundos > 0) args.push("-ss", (o.copiaVideo ? o.inicioSegundos + 0.25 : o.inicioSegundos).toFixed(6));
  args.push("-i", o.entrada, "-map_metadata", "-1", "-map_chapters", "-1", "-threads", String(o.ffmpegThreads ?? 0));
  const taxaAlvo = o.plano.targetHeight && o.plano.targetHeight <= 480 ? 1_500_000 : o.plano.targetHeight && o.plano.targetHeight <= 720 ? 3_000_000 : 8_000_000;
  // Keyframe no início de cada segmento. "t" conta do início da saída (depois do -ss), não do -copyts.
  const keyframes = ["-force_key_frames:0", `expr:gte(t,n_forced*${SEGUNDOS_POR_SEGMENTO})`];
  if (o.copiaVideo) {
    args.push("-map", `0:${video.streamIndex}`, "-c:v", "copy");
  }
  else if (gpu) {
    const altura = o.plano.targetHeight ? `:w=-2:h='min(${o.plano.targetHeight},ih)'` : "";
    const filtro = decodificaNaGpu ? `scale_vaapi=format=nv12${altura}` : `${o.plano.targetHeight ? `scale=w=-2:h='min(${o.plano.targetHeight},ih)',` : ""}format=nv12,hwupload`;
    args.push("-map", `0:${video.streamIndex}`, "-vf", filtro, "-c:v", "h264_vaapi",
      "-b:v", String(taxaAlvo), "-maxrate", String(taxaAlvo), "-bufsize", String(taxaAlvo * 2), ...keyframes);
  }
  else {
    const filtros: string[] = [];
    if (o.plano.toneMap) filtros.push("zscale=t=linear:npl=100", "format=gbrpf32le", "zscale=p=bt709", "tonemap=hable:desat=0", "zscale=t=bt709:m=bt709:r=tv", "format=yuv420p");
    if (o.plano.targetHeight) filtros.push(`scale=w=-2:h='min(${o.plano.targetHeight},ih)'`);
    filtros.push("format=yuv420p");
    if (legenda?.kind === "bitmap") args.push("-filter_complex", `[0:${video.streamIndex}][0:${legenda.streamIndex}]overlay,${filtros.join(",")}[v]`, "-map", "[v]");
    else args.push("-map", `0:${video.streamIndex}`, "-vf", filtros.join(","));
    const taxa = taxaAlvo;
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", String(taxa), "-bufsize", String(taxa * 2),
      "-profile:v", "high", "-level", "4.1", "-sc_threshold", "0",
      // Verificado com o FFmpeg: expressão com o deslocamento absoluto não força nada e o corte cai no GOP padrão.
      ...keyframes);
  }
  if (audio) {
    args.push("-map", `0:${audio.streamIndex}`);
    if (o.plano.audioCopy) args.push("-c:a", "copy");
    else args.push("-c:a", "aac", "-ac", String(Math.min(2, audio.channels || 2)), "-b:a", "192k");
  }
  else args.push("-an");
  args.push("-copyts", "-avoid_negative_ts", "disabled", "-max_muxing_queue_size", "2048",
    "-f", "hls", "-max_delay", "5000000", "-hls_time", String(SEGUNDOS_POR_SEGMENTO),
    // Init próprio de cada FFmpeg: o arquivo só fica completo quando o primeiro segmento fecha, e um reinício não
    // pode sobrescrever o init que o player já está lendo (ver GerenciadorHls.segmento).
    "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", `init-${o.segmento}.mp4`, "-start_number", String(o.segmento),
    "-hls_segment_filename", path.join(o.pasta, "%d.mp4"), "-hls_playlist_type", "vod", "-hls_list_size", "0",
    "-hls_flags", "temp_file", "-hls_segment_options", "movflags=+frag_discont", "-y", path.join(o.pasta, "ffmpeg.m3u8"));
  return args;
}

export class GerenciadorHls {
  private readonly sessoes = new Map<string, Sessao>();
  private readonly limpeza: NodeJS.Timeout;
  constructor(private readonly raiz: string, private readonly keyframes: CacheKeyframes, private readonly ffmpeg = "ffmpeg", private readonly aceleracao: Aceleracao | null = null) {
    fs.rmSync(raiz, { recursive: true, force: true });
    fs.mkdirSync(raiz, { recursive: true });
    this.limpeza = setInterval(() => {
      for (const s of this.sessoes.values()) if (Date.now() - s.ultimoAcesso > SESSAO_OCIOSA_MS) this.encerrar(s.id);
    }, 30_000);
    this.limpeza.unref();
  }

  criar(usuario: string, media: MediaItem, info: MediaTechnicalInfo, plano: PlaybackPlan): string {
    // Uma sessão por pessoa e título: abrir de novo encerra a anterior (e o FFmpeg dela).
    for (const s of this.sessoes.values()) if (s.usuario === usuario && s.media.id === media.id) this.encerrar(s.id);
    const copiaVideo = plano.mode === "remux";
    let duracoes: number[];
    if (copiaVideo) duracoes = segmentosPorKeyframes(this.keyframes.obter(media.absolutePath, `${media.size}:${media.modifiedAt}`), SEGUNDOS_POR_SEGMENTO * 1000);
    else duracoes = segmentosIguais(SEGUNDOS_POR_SEGMENTO * 1000, Math.round(info.duration * 10_000_000));
    const id = crypto.randomUUID();
    const pasta = path.join(this.raiz, id);
    fs.mkdirSync(pasta, { recursive: true });
    this.sessoes.set(id, { id, usuario, media, info, plano, copiaVideo, duracoes, inicios: iniciosDosSegmentos(duracoes), pasta, trabalho: null, ultimoAcesso: Date.now(), fila: Promise.resolve(), semGpu: false });
    return id;
  }

  sessao(id: string, usuario: string, mediaId: string): Sessao | null {
    const s = this.sessoes.get(id);
    if (!s || s.usuario !== usuario || s.media.id !== mediaId) return null;
    s.ultimoAcesso = Date.now();
    return s;
  }

  playlist(s: Sessao): string {
    return playlistVod(s.duracoes, "", "");
  }

  /** Caminho do segmento pronto (-1 = init.mp4), gerando sob demanda. */
  async segmento(s: Sessao, numero: number): Promise<string> {
    if (numero < -1 || numero >= s.duracoes.length) throw new Error("Segmento inexistente.");
    const arquivo = path.join(s.pasta, numero === -1 ? "init.mp4" : `${numero}.mp4`);
    if (fs.existsSync(arquivo)) return arquivo;
    if (numero === -1) {
      // O init só é entregue completo: depois que o primeiro segmento de um FFmpeg fechou, o init dele é copiado
      // (cópia + rename) para init.mp4. Todos os FFmpeg da sessão usam os mesmos parâmetros, então o init é o mesmo.
      const decisao = s.fila.then(() => { if (!s.trabalho) this.garantirTrabalho(s, 0, true); });
      s.fila = decisao.catch(() => undefined);
      await decisao;
      const limite = Date.now() + ESPERA_MAXIMA_MS;
      while (Date.now() < limite) {
        if (fs.existsSync(arquivo)) return arquivo;
        const t = s.trabalho;
        if (t) {
          while (fs.existsSync(path.join(s.pasta, `${t.proximo}.mp4`))) t.proximo++;
          const initDoTrabalho = path.join(s.pasta, `init-${t.inicio}.mp4`);
          if ((t.proximo > t.inicio || t.terminou) && fs.existsSync(initDoTrabalho)) {
            fs.copyFileSync(initDoTrabalho, `${arquivo}.copia`);
            fs.renameSync(`${arquivo}.copia`, arquivo);
            return arquivo;
          }
          if (t.terminou) throw new Error(`O FFmpeg terminou sem gerar o init (código ${t.codigo}). ${t.diagnostico.slice(-400)}`);
        }
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error("Tempo esgotado esperando o init.");
    }
    // Decisão serializada por sessão (o LockAsync do Jellyfin).
    const decisao = s.fila.then(() => this.garantirTrabalho(s, numero === -1 ? 0 : numero, numero === -1));
    s.fila = decisao.catch(() => undefined);
    await decisao;
    const limite = Date.now() + ESPERA_MAXIMA_MS;
    while (Date.now() < limite) {
      if (fs.existsSync(arquivo)) return arquivo;
      const t = s.trabalho;
      if (t?.terminou && t.codigo !== null && t.codigo !== 0 && t.gpu && !s.semGpu) {
        // A GPU falhou: o resto da sessão converte por software, sem o player perceber.
        console.error(`Aceleração de vídeo falhou em ${s.media.title}; convertendo por software. ${t.diagnostico.slice(-300)}`);
        s.semGpu = true;
        const refazer = s.fila.then(() => this.garantirTrabalho(s, numero, false));
        s.fila = refazer.catch(() => undefined);
        await refazer;
        continue;
      }
      if (!t || (t.terminou && !fs.existsSync(arquivo))) {
        if (t?.terminou && t.codigo === 0 && numero >= t.inicio) await new Promise(r => setTimeout(r, 50));
        if (fs.existsSync(arquivo)) return arquivo;
        if (t?.terminou) throw new Error(`O FFmpeg terminou sem gerar o segmento ${numero} (código ${t.codigo}). ${t.diagnostico.slice(-400)}`);
      }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Tempo esgotado esperando o segmento ${numero}.`);
  }

  private garantirTrabalho(s: Sessao, numero: number, pediuInit: boolean): void {
    const t = s.trabalho;
    if (t) while (fs.existsSync(path.join(s.pasta, `${t.proximo}.mp4`))) t.proximo++;
    const salto = Math.ceil(SALTO_QUE_REINICIA_S / SEGUNDOS_POR_SEGMENTO);
    const arquivo = path.join(s.pasta, pediuInit ? "init.mp4" : `${numero}.mp4`);
    if (fs.existsSync(arquivo)) return;
    const reiniciar = !t
      || (t.terminou && (pediuInit || numero >= t.proximo || numero < t.inicio))
      || (!pediuInit && numero < t.inicio)
      || (!pediuInit && numero - t.proximo > salto);
    if (!reiniciar) return;
    if (t && !t.terminou) t.processo.kill("SIGKILL");
    for (const nome of fs.readdirSync(s.pasta)) if (nome.endsWith(".tmp")) fs.rmSync(path.join(s.pasta, nome), { force: true });
    const inicio = pediuInit && t ? t.inicio : numero;
    const opcoes = {
      entrada: s.media.absolutePath, info: s.info, plano: s.plano, copiaVideo: s.copiaVideo,
      segmento: inicio, inicioSegundos: s.inicios[inicio] ?? 0, pasta: s.pasta, aceleracao: s.semGpu ? null : this.aceleracao
    };
    const processo = spawn(this.ffmpeg, argumentosFfmpeg(opcoes), { stdio: ["ignore", "ignore", "pipe"] });
    const trabalho: Trabalho = { processo, inicio, proximo: inicio, terminou: false, codigo: null, diagnostico: "", gpu: usaAceleracao(opcoes) };
    processo.stderr?.on("data", d => { trabalho.diagnostico = `${trabalho.diagnostico}${d}`.slice(-4000); });
    processo.once("exit", codigo => { trabalho.terminou = true; trabalho.codigo = codigo; });
    s.trabalho = trabalho;
  }

  encerrar(id: string): void {
    const s = this.sessoes.get(id);
    if (!s) return;
    this.sessoes.delete(id);
    if (s.trabalho && !s.trabalho.terminou) s.trabalho.processo.kill("SIGKILL");
    fs.rmSync(s.pasta, { recursive: true, force: true });
  }

  encerrarDoUsuario(usuario: string, mediaId: string): void {
    for (const s of [...this.sessoes.values()]) if (s.usuario === usuario && s.media.id === mediaId) this.encerrar(s.id);
  }

  parar(): void {
    clearInterval(this.limpeza);
    for (const id of [...this.sessoes.keys()]) this.encerrar(id);
  }
}
