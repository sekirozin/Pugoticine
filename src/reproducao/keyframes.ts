// Posições dos keyframes do vídeo, para montar a playlist HLS alinhada quando o vídeo é copiado (remux).
// Porte do Jellyfin 10.11.10 (Jellyfin.MediaEncoding.Keyframes): no MKV lê só o índice (SeekHead → Info, Tracks,
// Cues), sem percorrer o arquivo; nos outros contêineres usa o ffprobe (pacotes com a flag K).
// Tempos em ticks (100 ns), como no Jellyfin, para não acumular erro de arredondamento.
import { rodarFfprobe } from "../probe.js";
import fs from "node:fs";

export interface DadosKeyframes { duracaoTicks: number; keyframesTicks: number[] }

const IDS = {
  segmento: 0x18538067, seekHead: 0x114d9b74, seek: 0x4dbb, seekId: 0x53ab, seekPosition: 0x53ac,
  info: 0x1549a966, escalaTempo: 0x2ad7b1, duracao: 0x4489,
  trilhas: 0x1654ae6b, entradaTrilha: 0xae, numeroTrilha: 0xd7, tipoTrilha: 0x83,
  cues: 0x1c53bb6b, cuePoint: 0xbb, cueTime: 0xb3, cueTrackPositions: 0xb7, cueTrack: 0xf7
};
const TRILHA_VIDEO = 1;

class LeitorEbml {
  private readonly buffer = Buffer.alloc(16);
  constructor(private readonly fd: number, private readonly tamanhoArquivo: number) {}
  private ler(posicao: number, quantidade: number): Buffer {
    const destino = quantidade <= 16 ? this.buffer : Buffer.alloc(quantidade);
    const lidos = fs.readSync(this.fd, destino, 0, quantidade, posicao);
    if (lidos < quantidade) throw new Error("Fim inesperado do arquivo Matroska.");
    return destino;
  }
  /** Inteiro de tamanho variável (VINT). ID mantém os bits de marcação; tamanho remove. */
  private vint(posicao: number, manterMarcador: boolean): { valor: number; bytes: number; desconhecido: boolean } {
    const primeiro = this.ler(posicao, 1)[0];
    let bytes = 1;
    while (bytes <= 8 && !(primeiro & (0x80 >> (bytes - 1)))) bytes++;
    if (bytes > 8) throw new Error("VINT inválido no Matroska.");
    const dados = this.ler(posicao, bytes);
    let valor = manterMarcador ? dados[0] : dados[0] & (0xff >> bytes);
    let todosUm = valor === (0xff >> bytes);
    for (let i = 1; i < bytes; i++) { valor = valor * 256 + dados[i]; todosUm &&= dados[i] === 0xff; }
    return { valor, bytes, desconhecido: !manterMarcador && todosUm };
  }
  /** Elemento em `posicao`: id, início dos dados e tamanho (desconhecido = até o fim do pai). */
  elemento(posicao: number, fimDoPai: number): { id: number; dados: number; tamanho: number; fim: number } {
    const id = this.vint(posicao, true);
    const tamanho = this.vint(posicao + id.bytes, false);
    const dados = posicao + id.bytes + tamanho.bytes;
    const fim = tamanho.desconhecido ? fimDoPai : Math.min(dados + tamanho.valor, fimDoPai);
    return { id: id.valor, dados, tamanho: fim - dados, fim };
  }
  *filhos(inicio: number, fim: number): Generator<{ id: number; dados: number; tamanho: number; fim: number }> {
    let posicao = inicio;
    while (posicao < fim) {
      const e = this.elemento(posicao, fim);
      yield e;
      if (e.fim <= posicao) break;
      posicao = e.fim;
    }
  }
  inteiro(dados: number, tamanho: number): number {
    const b = this.ler(dados, tamanho);
    let valor = 0;
    for (let i = 0; i < tamanho; i++) valor = valor * 256 + b[i];
    return valor;
  }
  real(dados: number, tamanho: number): number {
    const b = this.ler(dados, tamanho);
    return tamanho === 4 ? b.readFloatBE(0) : b.readDoubleBE(0);
  }
  get fimArquivo(): number { return this.tamanhoArquivo; }
}

/** Porte de MatroskaKeyframeExtractor.GetKeyframeData. */
export function keyframesMatroska(caminho: string): DadosKeyframes {
  const fd = fs.openSync(caminho, "r");
  try {
    const leitor = new LeitorEbml(fd, fs.fstatSync(fd).size);
    let segmento: { dados: number; fim: number } | null = null;
    for (const e of leitor.filhos(0, leitor.fimArquivo)) if (e.id === IDS.segmento) { segmento = e; break; }
    if (!segmento) throw new Error("Sem Segment no Matroska.");
    const posicoes: Record<number, number> = {};
    for (const e of leitor.filhos(segmento.dados, segmento.fim)) {
      if (e.id !== IDS.seekHead) continue;
      for (const seek of leitor.filhos(e.dados, e.fim)) {
        if (seek.id !== IDS.seek) continue;
        let id = 0, posicao = -1;
        for (const campo of leitor.filhos(seek.dados, seek.fim)) {
          if (campo.id === IDS.seekId) id = leitor.inteiro(campo.dados, campo.tamanho);
          if (campo.id === IDS.seekPosition) posicao = leitor.inteiro(campo.dados, campo.tamanho);
        }
        if (posicao >= 0 && posicoes[id] === undefined) posicoes[id] = segmento.dados + posicao;
      }
      break;
    }
    if (posicoes[IDS.info] === undefined || posicoes[IDS.trilhas] === undefined || posicoes[IDS.cues] === undefined)
      throw new Error("SeekHead sem Info, Tracks ou Cues.");
    const info = leitor.elemento(posicoes[IDS.info], segmento.fim);
    let escala = 1_000_000, duracao: number | null = null;
    for (const e of leitor.filhos(info.dados, info.fim)) {
      if (e.id === IDS.escalaTempo) escala = leitor.inteiro(e.dados, e.tamanho);
      if (e.id === IDS.duracao) duracao = leitor.real(e.dados, e.tamanho);
    }
    const trilhas = leitor.elemento(posicoes[IDS.trilhas], segmento.fim);
    let trilhaVideo: number | null = null;
    for (const entrada of leitor.filhos(trilhas.dados, trilhas.fim)) {
      if (entrada.id !== IDS.entradaTrilha) continue;
      let numero = 0, tipo = 0;
      for (const e of leitor.filhos(entrada.dados, entrada.fim)) {
        if (e.id === IDS.numeroTrilha) numero = leitor.inteiro(e.dados, e.tamanho);
        if (e.id === IDS.tipoTrilha) tipo = leitor.inteiro(e.dados, e.tamanho);
      }
      if (tipo === TRILHA_VIDEO) { trilhaVideo = numero; break; }
    }
    if (trilhaVideo === null) throw new Error("Sem trilha de vídeo no Matroska.");
    const cues = leitor.elemento(posicoes[IDS.cues], segmento.fim);
    if (cues.id !== IDS.cues) throw new Error("Posição dos Cues inválida.");
    const keyframes: number[] = [];
    for (const ponto of leitor.filhos(cues.dados, cues.fim)) {
      if (ponto.id !== IDS.cuePoint) continue;
      let tempo: number | null = null, trilha: number | null = null;
      for (const e of leitor.filhos(ponto.dados, ponto.fim)) {
        if (e.id === IDS.cueTime) tempo = leitor.inteiro(e.dados, e.tamanho);
        if (e.id === IDS.cueTrackPositions && trilha === null)
          for (const p of leitor.filhos(e.dados, e.fim)) if (p.id === IDS.cueTrack) trilha = leitor.inteiro(p.dados, p.tamanho);
      }
      if (tempo !== null && trilha === trilhaVideo) keyframes.push(Math.round(tempo * escala / 100));
    }
    return { duracaoTicks: Math.round((duracao ?? 0) * escala / 100), keyframesTicks: keyframes };
  }
  finally {
    fs.closeSync(fd);
  }
}

/** Alternativa para outros contêineres: pacotes de vídeo com a flag K (como o FfProbeKeyframeExtractor). Lê o arquivo
 *  inteiro (minutos num HD), por isso roda sem bloquear o servidor. */
export async function keyframesFfprobe(caminho: string, ffprobe = "ffprobe"): Promise<DadosKeyframes> {
  let saida: string;
  try {
    saida = await rodarFfprobe(["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags",
      "-show_entries", "format=duration", "-of", "csv=p=0", caminho], 300_000, ffprobe);
  } catch (erro) { throw new Error(`ffprobe não leu os keyframes: ${erro instanceof Error ? erro.message : erro}`); }
  const keyframes: number[] = [];
  let duracao = 0;
  for (const linha of saida.split("\n")) {
    const [tempo, flags] = linha.split(",");
    if (flags === undefined) { if (tempo && Number.isFinite(Number(tempo))) duracao = Number(tempo); continue; }
    if (flags.includes("K") && Number.isFinite(Number(tempo))) keyframes.push(Math.round(Number(tempo) * 10_000_000));
  }
  keyframes.sort((a, b) => a - b);
  return { duracaoTicks: Math.round(duracao * 10_000_000), keyframesTicks: keyframes };
}

/** Matroska pelo índice; se falhar (sem Cues etc.), ffprobe. Resultado em cache por arquivo (tamanho + data). */
export class CacheKeyframes {
  private dados: Record<string, { assinatura: string; keyframes: DadosKeyframes }> = {};
  private readonly emAndamento = new Map<string, Promise<DadosKeyframes>>();
  constructor(private readonly arquivo: string) {
    try { this.dados = JSON.parse(fs.readFileSync(arquivo, "utf8")); } catch { this.dados = {}; }
  }
  /** Já calculado para este arquivo (tamanho + data)? */
  temEmCache(caminho: string, assinatura: string): boolean {
    return this.dados[caminho]?.assinatura === assinatura;
  }
  /** Só o índice do Matroska (leitura curta), para o aquecimento: sem Cues, lança (o ffprobe fica para quando abrirem). */
  async obterSoIndice(caminho: string, assinatura: string): Promise<DadosKeyframes> {
    if (this.temEmCache(caminho, assinatura)) return this.dados[caminho].keyframes;
    const keyframes = keyframesMatroska(caminho);
    if (!keyframes.keyframesTicks.length || !keyframes.duracaoTicks) throw new Error("sem keyframes no índice");
    this.dados[caminho] = { assinatura, keyframes };
    await fs.promises.writeFile(this.arquivo, JSON.stringify(this.dados));
    return keyframes;
  }
  async obter(caminho: string, assinatura: string): Promise<DadosKeyframes> {
    const salvo = this.dados[caminho];
    if (salvo?.assinatura === assinatura) return salvo.keyframes;
    const chave = `${caminho}|${assinatura}`;
    const andamento = this.emAndamento.get(chave);
    if (andamento) return andamento;
    const promessa = (async () => {
      let keyframes: DadosKeyframes;
      try {
        // Matroska: só o índice (Cues), leitura curta; o resto vai pelo ffprobe.
        keyframes = /\.(mkv|webm|mk3d)$/i.test(caminho) ? keyframesMatroska(caminho) : await keyframesFfprobe(caminho);
        if (!keyframes.keyframesTicks.length || !keyframes.duracaoTicks) throw new Error("sem keyframes no índice");
      } catch {
        keyframes = await keyframesFfprobe(caminho);
      }
      this.dados[caminho] = { assinatura, keyframes };
      await fs.promises.writeFile(this.arquivo, JSON.stringify(this.dados));
      return keyframes;
    })();
    this.emAndamento.set(chave, promessa);
    try { return await promessa; } finally { this.emAndamento.delete(chave); }
  }
}
