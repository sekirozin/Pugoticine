// Organizador de downloads feitos à mão no Transmission (magnet colado direto, fora do Radarr/Sonarr).
// Quando o torrent termina, o script do Transmission avisa o PugotiCine, que:
//  1. identifica o conteúdo pelas regras de nome do Jellyfin (episódio "S01E05"/" - 05" = série; senão, filme);
//  2. acha o título no TMDB (pt-BR): animação japonesa = Animes, outras séries = Séries;
//  3. garante o título no Radarr/Sonarr (cadastra sem monitorar nem buscar, na pasta raiz certa);
//  4. pede ao Radarr/Sonarr a importação manual movendo os arquivos (eles renomeiam: "Filme (Ano)/", "Série/Season N/");
//  5. confirmada a importação de todos os vídeos, remove o torrent do Transmission (com as sobras: .url, .png...).
// Os downloads do próprio Radarr/Sonarr (pastas radarr/ e tv-sonarr/) não passam por aqui.
import fs from "node:fs";
import path from "node:path";
import { ehArquivoDeVideo, resolverVideo } from "./nomes/jellyfin.js";

export type ConfigOrganizador = {
  radarr: { url: string; chave: string };
  sonarr: { url: string; chave: string };
  transmission: { url: string; usuario: string; senha: string };
  tmdb: { url: string; token: string };
  raizes: { filmes: string; series: string; animes: string };
  /** Registra no Painel › Atividade. */
  registrar?: (resumo: string, detalhe: string, nivel: "Information" | "Warning" | "Error") => void;
  esperaComandoMs?: number;
};
export type Pedido = { pasta: string; hash?: string; nome?: string };
export type Resultado = { tipo: "filme" | "serie" | "anime" | "ignorado"; titulo: string; importados: number; pendentes: string[]; torrentRemovido: boolean; motivo?: string };

const IGNORAR = /(^|[\\/._ -])(sample|trailer|amostra)([\\/._ -]|$)/i;

/** Vídeos de uma pasta (ou o próprio arquivo), sem amostras. */
export function videosDe(caminho: string): string[] {
  let st: fs.Stats;
  try { st = fs.statSync(caminho); } catch { return []; }
  if (st.isFile()) return ehArquivoDeVideo(caminho) && !IGNORAR.test(path.basename(caminho)) ? [caminho] : [];
  const lista: string[] = [];
  for (const nome of fs.readdirSync(caminho)) lista.push(...videosDe(path.join(caminho, nome)));
  return lista.sort();
}

// Marcas explícitas de episódio/temporada (as regras "otimistas" do Jellyfin leem "2014" de um filme como episódio).
const MARCAS_SERIE: RegExp[] = [
  /^(.*?)[ ._\-\[(]*\bS(\d{1,2})[ ._-]?E(\d{1,4})\b/i,                    // Nome.S01E05
  /^(.*?)[ ._\-\[(]*\b(\d{1,2})x(\d{2,3})\b/i,                             // Nome 1x05
  /^\s*\[[^\]]+\]\s*(.+?)\s+-\s+(\d{1,4})(?:v\d)?(?=\s*[\[(]|\s*$|\.)/i,   // [Grupo] Nome - 05 (anime)
  /^(.*?)[ ._-]+(?:Ep|Epis[oó]dio|Episode)[ ._]?(\d{1,4})\b/i,             // Nome Episódio 5
  /^(.*?)[ ._-]+S(\d{1,2})(?=[ ._-]|$)(?!E)/i,                             // Nome S04 1080p (temporada completa)
  /^(.*?)[ ._-]+(?:Season|Temporada)[ ._]?(\d{1,2})\b/i                    // Nome Season 1
];
function limparNome(nome: string): string {
  return nome.replace(/^\s*\[[^\]]+\]\s*/, "").replace(/[._]+/g, " ").replace(/\s*[\[(]?(?:19|20)\d{2}[\])]?\s*$/, "").replace(/[\s\-–:]+$/g, "").replace(/\s{2,}/g, " ").trim();
}
function marcaDeSerie(nome: string): string | null {
  for (const re of MARCAS_SERIE) {
    const m = nome.match(re);
    if (m && limparNome(m[1] ?? "").length > 1) return limparNome(m[1]);
  }
  return null;
}

/** Filme ou série, com o nome para a busca. */
export function classificar(pasta: string, videos: string[]): { tipo: "filme" | "serie"; nome: string; ano: number | null } {
  const daPasta = marcaDeSerie(path.basename(pasta));
  if (daPasta) return { tipo: "serie", nome: daPasta, ano: null };
  for (const v of videos) {
    const doArquivo = marcaDeSerie(path.basename(v, path.extname(v)));
    if (doArquivo) return { tipo: "serie", nome: doArquivo, ano: null };
  }
  // Filme: nome e ano pelas regras do Jellyfin (VideoResolver/CleanDateTime), da pasta do torrent ou do arquivo.
  const ehPasta = fs.existsSync(pasta) ? fs.statSync(pasta).isDirectory() : !ehArquivoDeVideo(pasta);
  const v = resolverVideo(pasta, ehPasta) ?? (videos[0] ? resolverVideo(videos[0], false) : null);
  return { tipo: "filme", nome: limparNome(v?.nome ?? path.basename(pasta)), ano: v?.ano ?? null };
}

export class Organizador {
  private fila: Promise<unknown> = Promise.resolve();
  private sessaoTransmission = "";
  constructor(private readonly c: ConfigOrganizador) {}

  /** Enfileira (um por vez, para não brigar com o Radarr/Sonarr). */
  organizar(pedido: Pedido): Promise<Resultado> {
    const tarefa = this.fila.then(() => this.processar(pedido));
    this.fila = tarefa.catch(() => undefined);
    return tarefa;
  }

  private log(resumo: string, detalhe: string, nivel: "Information" | "Warning" | "Error" = "Information"): void {
    console[nivel === "Error" ? "error" : "log"](`Organizador: ${resumo}${detalhe ? ` — ${detalhe}` : ""}`);
    this.c.registrar?.(resumo, detalhe, nivel);
  }

  private async processar(pedido: Pedido): Promise<Resultado> {
    const pasta = path.resolve(pedido.pasta);
    const videos = videosDe(pasta);
    if (!videos.length) return { tipo: "ignorado", titulo: path.basename(pasta), importados: 0, pendentes: [], torrentRemovido: false, motivo: "sem vídeos" };
    const { tipo, nome, ano } = classificar(pasta, videos);
    try {
      const r = tipo === "filme" ? await this.importarFilme(pasta, videos, nome, ano) : await this.importarSerie(pasta, videos, nome);
      const pendentes = videos.filter((v) => fs.existsSync(v));
      let torrentRemovido = false;
      if (!pendentes.length) torrentRemovido = await this.removerTorrent(pedido, pasta);
      const resultado: Resultado = { ...r, importados: videos.length - pendentes.length, pendentes, torrentRemovido };
      if (pendentes.length) this.log(`${r.titulo}: ${pendentes.length} arquivo(s) não importado(s)`, pendentes.map((p) => path.basename(p)).join(", "), "Warning");
      else this.log(`${r.titulo} organizado em ${r.tipo === "filme" ? "Filmes" : r.tipo === "anime" ? "Animes" : "Séries"}`, `${resultado.importados} arquivo(s)${torrentRemovido ? "; torrent removido do Transmission" : ""}`);
      return resultado;
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.log(`Não foi possível organizar ${path.basename(pasta)}`, motivo, "Error");
      return { tipo: "ignorado", titulo: nome, importados: 0, pendentes: videos, torrentRemovido: false, motivo };
    }
  }

  // ---------- HTTP ----------
  private async arr<T>(servico: "radarr" | "sonarr", metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const s = this.c[servico];
    const r = await fetch(`${s.url}/api/v3${caminho}`, { method: metodo, headers: { "X-Api-Key": s.chave, "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`${servico} respondeu ${r.status} em ${caminho}: ${(await r.text()).slice(0, 300)}`);
    return (r.status === 204 ? null : await r.json()) as T;
  }
  private async tmdb<T>(caminho: string, parametros: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.c.tmdb.url}${caminho}`);
    for (const [k, v] of Object.entries(parametros)) if (v !== undefined) url.searchParams.set(k, String(v));
    const r = await fetch(url, { headers: { Authorization: `Bearer ${this.c.tmdb.token}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`TMDB respondeu ${r.status} em ${caminho}`);
    return r.json() as Promise<T>;
  }
  /** Espera o comando do Radarr/Sonarr terminar. */
  private async esperar(servico: "radarr" | "sonarr", id: number): Promise<void> {
    const limite = Date.now() + (this.c.esperaComandoMs ?? 30 * 60_000);
    while (Date.now() < limite) {
      const c = await this.arr<{ status: string; message?: string }>(servico, "GET", `/command/${id}`);
      if (c.status === "completed") return;
      if (c.status === "failed" || c.status === "aborted" || c.status === "cancelled") throw new Error(`${servico}: importação ${c.status}${c.message ? ` (${c.message})` : ""}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`${servico}: importação demorou demais`);
  }
  private async perfilMaisUsado(servico: "radarr" | "sonarr", lista: { qualityProfileId: number }[], preferido?: number): Promise<number> {
    if (preferido) return preferido;
    const contagem = new Map<number, number>();
    for (const i of lista) contagem.set(i.qualityProfileId, (contagem.get(i.qualityProfileId) ?? 0) + 1);
    const maisUsado = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (maisUsado) return maisUsado;
    return (await this.arr<{ id: number }[]>(servico, "GET", "/qualityprofile"))[0].id;
  }

  // ---------- filmes (Radarr) ----------
  private async importarFilme(pasta: string, videos: string[], nome: string, ano: number | null) {
    type Busca = { results: { id: number; title: string; original_title: string; release_date?: string }[] };
    const busca = await this.tmdb<Busca>("/search/movie", { query: nome, year: ano ?? undefined, language: "pt-BR" });
    const achado = busca.results.find((r) => !ano || r.release_date?.startsWith(String(ano))) ?? busca.results[0];
    if (!achado) throw new Error(`filme "${nome}${ano ? ` (${ano})` : ""}" não encontrado no TMDB`);
    type Filme = { id: number; title: string; year: number; qualityProfileId: number; tmdbId: number };
    const biblioteca = await this.arr<Filme[]>("radarr", "GET", "/movie");
    let filme = biblioteca.find((m) => m.tmdbId === achado.id);
    if (!filme) {
      const modelo = await this.arr<Record<string, unknown>>("radarr", "GET", `/movie/lookup/tmdb?tmdbId=${achado.id}`);
      filme = await this.arr<Filme>("radarr", "POST", "/movie", { ...modelo, qualityProfileId: await this.perfilMaisUsado("radarr", biblioteca),
        rootFolderPath: this.c.raizes.filmes, monitored: false, minimumAvailability: "released", addOptions: { searchForMovie: false } });
      this.log(`${filme.title} (${filme.year}) cadastrado no Radarr`, "sem monitorar e sem buscar", "Information");
    }
    type Item = { path: string; quality: unknown; languages: unknown; releaseGroup?: string; folderName?: string; rejections?: { type: string; reason: string }[] };
    const itens = await this.arr<Item[]>("radarr", "GET", `/manualimport?folder=${encodeURIComponent(pasta)}&movieId=${filme.id}&filterExistingFiles=false`);
    const arquivos = itens.filter((i) => videos.includes(path.resolve(i.path)) && !i.rejections?.some((r) => /sample/i.test(r.reason)))
      .map((i) => ({ path: i.path, movieId: filme!.id, quality: i.quality, languages: i.languages, releaseGroup: i.releaseGroup, folderName: i.folderName }));
    if (!arquivos.length) throw new Error("o Radarr não reconheceu nenhum vídeo para importar");
    // Um filme = um arquivo: com vários, importa o maior (o resto fica pendente e o torrent não é removido).
    const principal = arquivos.length > 1 ? [arquivos.sort((a, b) => fs.statSync(b.path).size - fs.statSync(a.path).size)[0]] : arquivos;
    const cmd = await this.arr<{ id: number }>("radarr", "POST", "/command", { name: "ManualImport", importMode: "move", files: principal });
    await this.esperar("radarr", cmd.id);
    return { tipo: "filme" as const, titulo: `${filme.title} (${filme.year})` };
  }

  // ---------- séries e animes (Sonarr) ----------
  private async importarSerie(pasta: string, videos: string[], nome: string) {
    type Busca = { results: { id: number; name: string; original_name: string; genre_ids: number[]; original_language: string }[] };
    const busca = await this.tmdb<Busca>("/search/tv", { query: nome, language: "pt-BR" });
    const alvo = nome.toLowerCase();
    const achado = busca.results.find((r) => [r.name, r.original_name].some((t) => t.toLowerCase() === alvo)) ?? busca.results[0];
    if (!achado) throw new Error(`série "${nome}" não encontrada no TMDB`);
    const anime = achado.genre_ids.includes(16) && achado.original_language === "ja";
    const externos = await this.tmdb<{ tvdb_id: number | null }>(`/tv/${achado.id}/external_ids`, {});
    if (!externos.tvdb_id) throw new Error(`série "${achado.name}" sem ID do TVDB (o Sonarr precisa dele)`);
    type Serie = { id: number; title: string; tvdbId: number; qualityProfileId: number; seriesType: string };
    const biblioteca = await this.arr<Serie[]>("sonarr", "GET", "/series");
    let serie = biblioteca.find((s) => s.tvdbId === externos.tvdb_id);
    if (!serie) {
      const [modelo] = await this.arr<Record<string, unknown>[]>("sonarr", "GET", `/series/lookup?term=${encodeURIComponent(`tvdb:${externos.tvdb_id}`)}`);
      if (!modelo) throw new Error(`o Sonarr não achou tvdb:${externos.tvdb_id}`);
      const iguais = biblioteca.filter((s) => (s.seriesType === "anime") === anime);
      serie = await this.arr<Serie>("sonarr", "POST", "/series", { ...modelo, qualityProfileId: await this.perfilMaisUsado("sonarr", iguais.length ? iguais : biblioteca),
        rootFolderPath: anime ? this.c.raizes.animes : this.c.raizes.series, seriesType: anime ? "anime" : "standard", seasonFolder: true, monitored: false,
        addOptions: { monitor: "none", searchForMissingEpisodes: false, searchForCutoffUnmetEpisodes: false } });
      this.log(`${serie.title} cadastrado no Sonarr (${anime ? "Animes" : "Séries"})`, "sem monitorar e sem buscar", "Information");
    }
    type Item = { path: string; seasonNumber?: number; episodes?: { id: number }[]; quality: unknown; languages: unknown; releaseGroup?: string; folderName?: string };
    const itens = await this.arr<Item[]>("sonarr", "GET", `/manualimport?folder=${encodeURIComponent(pasta)}&seriesId=${serie.id}&filterExistingFiles=false`);
    const arquivos = itens.filter((i) => videos.includes(path.resolve(i.path)) && i.episodes?.length)
      .map((i) => ({ path: i.path, seriesId: serie!.id, seasonNumber: i.seasonNumber, episodeIds: i.episodes!.map((e) => e.id), quality: i.quality, languages: i.languages, releaseGroup: i.releaseGroup, folderName: i.folderName }));
    if (!arquivos.length) throw new Error("o Sonarr não reconheceu nenhum episódio para importar");
    const cmd = await this.arr<{ id: number }>("sonarr", "POST", "/command", { name: "ManualImport", importMode: "move", files: arquivos });
    await this.esperar("sonarr", cmd.id);
    return { tipo: anime ? "anime" as const : "serie" as const, titulo: serie.title };
  }

  // ---------- Transmission ----------
  private async rpc<T>(metodo: string, argumentos: Record<string, unknown>): Promise<T> {
    const t = this.c.transmission;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const r = await fetch(`${t.url}/transmission/rpc`, { method: "POST", signal: AbortSignal.timeout(15_000),
        headers: { "content-type": "application/json", "X-Transmission-Session-Id": this.sessaoTransmission, Authorization: `Basic ${Buffer.from(`${t.usuario}:${t.senha}`).toString("base64")}` },
        body: JSON.stringify({ method: metodo, arguments: argumentos }) });
      if (r.status === 409) { this.sessaoTransmission = r.headers.get("X-Transmission-Session-Id") ?? ""; continue; }
      if (!r.ok) throw new Error(`Transmission respondeu ${r.status}`);
      const corpo = await r.json() as { result: string; arguments: T };
      if (corpo.result !== "success") throw new Error(`Transmission: ${corpo.result}`);
      return corpo.arguments;
    }
    throw new Error("Transmission: sessão recusada");
  }
  /** Remove o torrent (e as sobras da pasta). Sem hash, procura pelo nome e pela pasta. */
  private async removerTorrent(pedido: Pedido, pasta: string): Promise<boolean> {
    if (!this.c.transmission.url) return false;
    try {
      let hash = pedido.hash;
      if (!hash) {
        const { torrents } = await this.rpc<{ torrents: { hashString: string; name: string; downloadDir: string }[] }>("torrent-get", { fields: ["hashString", "name", "downloadDir"] });
        hash = torrents.find((t) => path.resolve(t.downloadDir, t.name) === pasta)?.hashString;
      }
      if (!hash) return false;
      await this.rpc("torrent-remove", { ids: [hash], "delete-local-data": true });
      return true;
    } catch (erro) {
      this.log("Não foi possível remover o torrent do Transmission", erro instanceof Error ? erro.message : String(erro), "Warning");
      return false;
    }
  }
}
