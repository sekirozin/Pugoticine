import path from "node:path";
import type { Subtitle } from "./types.js";

/** Ações do histórico do Bazarr que deixam um arquivo de legenda dele no disco. */
const ACOES_COM_ARQUIVO = new Set([1, 2, 3, 4, 5]); // baixada, manual, melhoria, enviada, sincronizada
const IDIOMAS: Record<string, string> = { pb: "PT-BR", pt: "PT", en: "EN", es: "ES", ja: "JA" };

type RegistroHistorico = { action?: number; subtitles_path?: string | null; language?: { code2?: string } | null };
type Busca = (url: string, opcoes: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type OpcoesBazarr = {
  url: string;
  chave: string;
  /** Raiz da biblioteca como o Bazarr vê (ex.: /jellyfin) e como o Pugoticine vê (ex.: /media). */
  raizBazarr: string;
  raizLocal: string;
  busca?: Busca;
};

/**
 * Legendas baixadas pelo Bazarr. O arquivo continua "<vídeo>.pt-BR.srt" (o Bazarr só reconhece
 * esse nome); o Pugoticine mostra "Bazarr - PT-BR" no menu de legendas consultando o histórico.
 */
export class LegendasBazarr {
  private arquivos = new Map<string, string>();
  /** Legendas que apareceram no histórico desde a sincronização anterior (para varrer a biblioteca na hora). */
  novas: string[] = [];
  private readonly busca: Busca;
  constructor(private readonly opcoes: OpcoesBazarr) {
    this.busca = opcoes.busca ?? ((url, init) => fetch(url, init));
  }

  async sincronizar(): Promise<number> {
    const novos = new Map<string, string>();
    for (const tipo of ["movies", "episodes"]) {
      const resposta = await this.busca(`${this.opcoes.url}/api/${tipo}/history?start=0&length=-1`, {
        headers: { "X-API-KEY": this.opcoes.chave }, signal: AbortSignal.timeout(20_000)
      });
      if (!resposta.ok) throw new Error(`Bazarr respondeu ${resposta.status} em ${tipo}/history`);
      const corpo = await resposta.json() as { data?: RegistroHistorico[] };
      for (const registro of corpo.data ?? []) {
        if (!registro.subtitles_path || !ACOES_COM_ARQUIVO.has(Number(registro.action))) continue;
        const local = this.caminhoLocal(registro.subtitles_path);
        if (local) novos.set(local, IDIOMAS[registro.language?.code2 ?? ""] ?? (registro.language?.code2 ?? "").toUpperCase());
      }
    }
    this.novas = [...novos.keys()].filter((caminho) => !this.arquivos.has(caminho));
    this.arquivos = novos;
    return novos.size;
  }

  private caminhoLocal(caminhoBazarr: string): string | null {
    const relativo = path.posix.relative(this.opcoes.raizBazarr, caminhoBazarr);
    if (!relativo || relativo.startsWith("..") || path.posix.isAbsolute(relativo)) return null;
    return path.join(this.opcoes.raizLocal, relativo);
  }

  /** Troca o rótulo das legendas que vieram do Bazarr ("Bazarr - PT-BR"). */
  rotular<T extends Subtitle>(legenda: T): T {
    const idioma = this.arquivos.get(path.resolve(legenda.path));
    return idioma === undefined ? legenda : { ...legenda, label: `Bazarr - ${idioma || legenda.language.toUpperCase()}`, origem: "bazarr" };
  }
}
