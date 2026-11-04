// Imagens dos títulos (pôster 2:3 e fundo 16:9), leves e em cache, como as imagens do Jellyfin:
//  - a do Radarr quando existe (baixada uma vez); senão um quadro do próprio vídeo, escolhido pelo filtro "thumbnail"
//    do FFmpeg (o quadro mais representativo, não uma tela preta) — o "extrair imagens dos vídeos" do Jellyfin;
//  - entregue em WebP no tamanho que a tela pede (larguras fixas, para o cache servir a todos), gravada em disco e com
//    endereço versionado (cache permanente no navegador);
//  - no máximo 2 gerações ao mesmo tempo (o servidor é fraco) e pedidos iguais esperam a mesma geração.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MediaItem } from "./types.js";

export type TipoImagem = "poster" | "fundo";
export const LARGURAS: Record<TipoImagem, number[]> = { poster: [185, 342, 500, 780], fundo: [780, 1280, 1920] };
const VERSAO_DO_ALGORITMO = "1";
const SIMULTANEAS = 2;

export function larguraPadronizada(tipo: TipoImagem, pedida: number): number {
  const opcoes = LARGURAS[tipo];
  return opcoes.find((l) => l >= pedida) ?? opcoes[opcoes.length - 1];
}

function rodar(ffmpeg: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const processo = spawn(ffmpeg, ["-hide_banner", "-nostdin", "-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let erro = "";
    processo.stderr.on("data", (d) => { erro = `${erro}${d}`.slice(-1000); });
    const limite = setTimeout(() => processo.kill("SIGKILL"), 60_000);
    processo.once("exit", (codigo) => { clearTimeout(limite); codigo === 0 ? resolve() : reject(new Error(`FFmpeg da imagem saiu com ${codigo}: ${erro.trim()}`)); });
  });
}

export class Imagens {
  private readonly emAndamento = new Map<string, Promise<string>>();
  private ativas = 0;
  private readonly fila: (() => void)[] = [];
  constructor(private readonly pasta: string, private readonly ffmpeg: string, private readonly duracaoDe: (media: MediaItem) => number) {
    fs.mkdirSync(pasta, { recursive: true });
  }

  /** Muda quando o arquivo, a imagem do Radarr ou o jeito de gerar mudam (endereço novo = cache novo). */
  versao(media: MediaItem, remota: string): string {
    return crypto.createHash("sha256").update(`${VERSAO_DO_ALGORITMO}|${media.id}|${media.size}|${media.modifiedAt}|${remota}`).digest("hex").slice(0, 16);
  }

  async caminho(media: MediaItem, tipo: TipoImagem, pedida: number, remota: string): Promise<string> {
    const largura = larguraPadronizada(tipo, pedida);
    const arquivo = path.join(this.pasta, `${media.id}-${tipo}-${largura}-${this.versao(media, remota)}.webp`);
    if (fs.existsSync(arquivo)) return arquivo;
    const andamento = this.emAndamento.get(arquivo);
    if (andamento) return andamento;
    const tarefa = this.limitar(() => this.gerar(media, tipo, largura, remota, arquivo)).finally(() => this.emAndamento.delete(arquivo));
    this.emAndamento.set(arquivo, tarefa);
    return tarefa;
  }

  private async limitar<T>(trabalho: () => Promise<T>): Promise<T> {
    if (this.ativas >= SIMULTANEAS) await new Promise<void>((liberar) => this.fila.push(liberar));
    this.ativas++;
    try { return await trabalho(); }
    finally { this.ativas--; this.fila.shift()?.(); }
  }

  private async gerar(media: MediaItem, tipo: TipoImagem, largura: number, remota: string, destino: string): Promise<string> {
    const temporario = `${destino}.${process.pid}.tmp.webp`;
    // Pôster a partir de um quadro 16:9: recorte central em 2:3. Pôster sempre exatamente 2:3; fundo mantém a proporção.
    const recorte = tipo === "poster" ? "crop='min(iw,ih*2/3)':'min(ih,iw*3/2)'," : "";
    const escala = tipo === "poster" ? `scale=${largura}:${Math.round(largura * 1.5)}:flags=lanczos` : `scale=${largura}:-2:flags=lanczos`;
    let gerada = false;
    if (remota) {
      const original = path.join(this.pasta, `${media.id}-${tipo}-${this.versao(media, remota)}.original`);
      try {
        if (!fs.existsSync(original)) {
          const resposta = await fetch(remota, { signal: AbortSignal.timeout(15_000) });
          if (!resposta.ok) throw new Error(`imagem remota respondeu ${resposta.status}`);
          fs.writeFileSync(`${original}.tmp`, Buffer.from(await resposta.arrayBuffer()));
          fs.renameSync(`${original}.tmp`, original);
        }
        await rodar(this.ffmpeg, ["-i", original, "-vf", escala, "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", temporario]);
        gerada = true;
      } catch (erro) {
        console.error(`Imagem do Radarr indisponível para ${media.title}; usando um quadro do vídeo. ${erro instanceof Error ? erro.message : erro}`);
      }
    }
    if (!gerada) {
      const duracao = this.duracaoDe(media);
      const instante = duracao > 0 ? Math.max(1, duracao * 0.2) : 10;
      await rodar(this.ffmpeg, ["-ss", instante.toFixed(2), "-i", media.absolutePath, "-an", "-sn",
        "-vf", `thumbnail=48,${recorte}${escala}`, "-frames:v", "1", "-c:v", "libwebp", "-quality", "80", temporario]);
    }
    fs.renameSync(temporario, destino);
    return destino;
  }
}
