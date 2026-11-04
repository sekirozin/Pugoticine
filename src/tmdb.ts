// Metadados do TMDB em português, como o provedor TheMovieDb do Jellyfin (MediaBrowser.Providers/Plugins/Tmdb):
//  - filme: ID do TMDB vindo do Radarr, do .nfo da pasta (<tmdbid> / <uniqueid type="tmdb">) ou da busca por título e ano;
//  - série: ID do tvshow.nfo (o Jellyfin grava ao lado da série) ou da busca pelo nome; temporadas com nome, sinopse e
//    imagem de cada episódio;
//  - idioma pt-BR, com a sinopse em inglês quando não há tradução (como o Jellyfin);
//  - tudo guardado em disco (data/tmdb-cache.json) e renovado a cada 7 dias; o app só lê o cache (nunca espera a rede).
import fs from "node:fs";
import path from "node:path";

export type DadosTmdb = {
  tmdbId: number;
  titulo: string;
  tituloOriginal: string;
  sinopse: string;
  generos: string[];
  ano: number | null;
  duracao: number | null;
  classificacao: string;
  nota: number | null;
  estudio: string;
  poster: string;
  fundo: string;
};
export type EpisodioTmdb = { nome: string; sinopse: string; cena: string; duracao: number | null };
export type SerieTmdb = DadosTmdb & { episodios: Record<string, EpisodioTmdb> };
type Registro<T> = { buscadoEm: string; dados: T | null };
type Cache = { filmes: Record<string, Registro<DadosTmdb>>; series: Record<string, Registro<SerieTmdb>> };

/** O que o sincronizador precisa de cada item do catálogo. */
export type ItemParaTmdb = {
  absolutePath: string;
  relativePath: string;
  title: string;
  year: number | null;
  metadata?: { tmdbId?: number | null };
  serie?: { nome: string; temporada: number; episodio: number };
};

const VALIDADE_MS = 7 * 24 * 3600 * 1000;
const VALIDADE_SEM_RESULTADO_MS = 24 * 3600 * 1000;

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const chaveEpisodio = (temporada: number, episodio: number) => `${temporada}x${episodio}`;

/** Pasta da obra: a primeira pasta abaixo da raiz da biblioteca (filme ou série). */
export function pastaDaObra(item: { absolutePath: string; relativePath: string }): string {
  const raiz = item.absolutePath.slice(0, item.absolutePath.length - item.relativePath.length);
  const primeira = item.relativePath.split(/[\\/]/)[0];
  return item.relativePath.includes("/") || item.relativePath.includes("\\") ? path.join(raiz, primeira) : path.dirname(item.absolutePath);
}

/** ID do TMDB gravado num .nfo (formato Kodi/Jellyfin). */
export function tmdbIdDoNfo(arquivos: string[]): number | null {
  for (const arquivo of arquivos) {
    let texto: string;
    try { texto = fs.readFileSync(arquivo, "utf8"); } catch { continue; }
    const id = texto.match(/<tmdbid>\s*(\d+)\s*<\/tmdbid>/i)?.[1] ?? texto.match(/<uniqueid[^>]*type="tmdb"[^>]*>\s*(\d+)\s*</i)?.[1];
    if (id) return Number(id);
  }
  return null;
}

export class Tmdb {
  private cache: Cache = { filmes: {}, series: {} };
  private rodando: Promise<void> | null = null;
  private pendente = false;

  constructor(private readonly token: string, private readonly arquivoCache: string,
    private readonly base = "https://api.themoviedb.org/3", private readonly imagens = "https://image.tmdb.org/t/p") {
    try { this.cache = { filmes: {}, series: {}, ...JSON.parse(fs.readFileSync(arquivoCache, "utf8")) }; } catch { /* cache novo */ }
  }

  get ativo(): boolean { return Boolean(this.token); }
  static chaveFilme(item: { absolutePath: string; relativePath: string }): string { return pastaDaObra(item); }
  static chaveSerie(item: { absolutePath: string; relativePath: string }): string { return pastaDaObra(item); }
  filme(chave: string): DadosTmdb | null { return this.cache.filmes[chave]?.dados ?? null; }
  serie(chave: string): SerieTmdb | null { return this.cache.series[chave]?.dados ?? null; }

  /** Busca o que falta ou venceu. Chamadas durante uma sincronização marcam uma nova rodada ao fim. */
  sincronizar(itens: ItemParaTmdb[]): Promise<void> {
    if (!this.ativo) return Promise.resolve();
    if (this.rodando) { this.pendente = true; this.ultimos = itens; return this.rodando; }
    this.rodando = this.rodar(itens).finally(() => {
      this.rodando = null;
      if (this.pendente) { this.pendente = false; void this.sincronizar(this.ultimos); }
    });
    return this.rodando;
  }
  private ultimos: ItemParaTmdb[] = [];

  private vencido(registro: Registro<unknown> | undefined): boolean {
    if (!registro) return true;
    const idade = Date.now() - Date.parse(registro.buscadoEm);
    return idade > (registro.dados ? VALIDADE_MS : VALIDADE_SEM_RESULTADO_MS);
  }

  private async rodar(itens: ItemParaTmdb[]): Promise<void> {
    const filmes = new Map<string, ItemParaTmdb>();
    const series = new Map<string, { item: ItemParaTmdb; temporadas: Set<number> }>();
    for (const item of itens) {
      if (item.serie) {
        const chave = Tmdb.chaveSerie(item);
        const s = series.get(chave) ?? { item, temporadas: new Set<number>() };
        s.temporadas.add(item.serie.temporada);
        series.set(chave, s);
      } else filmes.set(Tmdb.chaveFilme(item), item);
    }
    let mudou = false;
    for (const [chave, item] of filmes) {
      if (!this.vencido(this.cache.filmes[chave])) continue;
      try { this.cache.filmes[chave] = { buscadoEm: new Date().toISOString(), dados: await this.buscarFilme(item, chave) }; mudou = true; }
      catch (erro) { console.error(`TMDB: falha no filme ${item.title}: ${erro instanceof Error ? erro.message : erro}`); }
    }
    for (const [chave, { item, temporadas }] of series) {
      const atual = this.cache.series[chave];
      const faltaTemporada = atual?.dados && [...temporadas].some((t) => !Object.keys(atual.dados!.episodios).some((k) => k.startsWith(`${t}x`)));
      if (!this.vencido(atual) && !faltaTemporada) continue;
      try { this.cache.series[chave] = { buscadoEm: new Date().toISOString(), dados: await this.buscarSerie(item, chave, [...temporadas]) }; mudou = true; }
      catch (erro) { console.error(`TMDB: falha na série ${item.serie?.nome}: ${erro instanceof Error ? erro.message : erro}`); }
    }
    if (mudou) {
      fs.mkdirSync(path.dirname(this.arquivoCache), { recursive: true });
      fs.writeFileSync(`${this.arquivoCache}.tmp`, JSON.stringify(this.cache));
      fs.renameSync(`${this.arquivoCache}.tmp`, this.arquivoCache);
      const f = Object.values(this.cache.filmes).filter((r) => r.dados).length, s = Object.values(this.cache.series).filter((r) => r.dados).length;
      console.log(`Metadados TMDB atualizados: ${f} filme(s), ${s} série(s).`);
    }
  }

  private async api<T>(caminho: string, parametros: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${this.base}${caminho}`);
    for (const [k, v] of Object.entries(parametros)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const resposta = await fetch(url, { headers: { Authorization: `Bearer ${this.token}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!resposta.ok) throw new Error(`TMDB respondeu ${resposta.status} em ${caminho}`);
    return resposta.json() as Promise<T>;
  }
  private imagem(caminho: string | null | undefined, tamanho: string): string { return caminho ? `${this.imagens}/${tamanho}${caminho}` : ""; }

  private async buscarFilme(item: ItemParaTmdb, pasta: string): Promise<DadosTmdb | null> {
    let id = item.metadata?.tmdbId || tmdbIdDoNfo([path.join(pasta, "movie.nfo"), item.absolutePath.replace(/\.[^.]+$/, ".nfo")]);
    if (!id) {
      type Busca = { results: { id: number; title: string; original_title: string; release_date?: string }[] };
      const r = await this.api<Busca>("/search/movie", { query: item.title, year: item.year ?? undefined, language: "pt-BR", include_adult: "false" });
      const alvo = normalizar(item.title);
      const melhor = r.results.find((x) => item.year && x.release_date?.startsWith(String(item.year)) && [x.title, x.original_title].some((t) => normalizar(t) === alvo))
        ?? r.results.find((x) => !item.year || x.release_date?.startsWith(String(item.year))) ?? r.results[0];
      id = melhor?.id ?? null;
    }
    if (!id) return null;
    type Filme = { id: number; title: string; original_title: string; overview: string; genres: { name: string }[]; runtime: number | null; vote_average: number;
      poster_path: string | null; backdrop_path: string | null; release_date: string; production_companies: { name: string }[];
      release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string }[] }[] } };
    const f = await this.api<Filme>(`/movie/${id}`, { language: "pt-BR", append_to_response: "release_dates" });
    const sinopse = f.overview || (await this.api<Filme>(`/movie/${id}`, { language: "en-US" })).overview || "";
    const classificacao = f.release_dates?.results.find((r) => r.iso_3166_1 === "BR")?.release_dates.map((d) => d.certification).find(Boolean)
      ?? f.release_dates?.results.find((r) => r.iso_3166_1 === "US")?.release_dates.map((d) => d.certification).find(Boolean) ?? "";
    return {
      tmdbId: f.id, titulo: f.title, tituloOriginal: f.original_title, sinopse, generos: f.genres.map((g) => g.name),
      ano: f.release_date ? Number(f.release_date.slice(0, 4)) : item.year, duracao: f.runtime || null, classificacao,
      nota: f.vote_average ? Math.round(f.vote_average * 10) : null, estudio: f.production_companies[0]?.name ?? "",
      poster: this.imagem(f.poster_path, "w780"), fundo: this.imagem(f.backdrop_path, "original")
    };
  }

  private async buscarSerie(item: ItemParaTmdb, pasta: string, temporadas: number[]): Promise<SerieTmdb | null> {
    let id = tmdbIdDoNfo([path.join(pasta, "tvshow.nfo")]);
    if (!id) {
      type Busca = { results: { id: number; name: string; original_name: string; first_air_date?: string }[] };
      const nome = item.serie!.nome;
      const r = await this.api<Busca>("/search/tv", { query: nome, language: "pt-BR", include_adult: "false" });
      const alvo = normalizar(nome);
      id = (r.results.find((x) => [x.name, x.original_name].some((t) => normalizar(t) === alvo)) ?? r.results[0])?.id ?? null;
    }
    if (!id) return null;
    type Serie = { id: number; name: string; original_name: string; overview: string; genres: { name: string }[]; episode_run_time: number[]; vote_average: number;
      poster_path: string | null; backdrop_path: string | null; first_air_date: string; networks: { name: string }[]; production_companies: { name: string }[];
      content_ratings?: { results: { iso_3166_1: string; rating: string }[] } };
    const s = await this.api<Serie>(`/tv/${id}`, { language: "pt-BR", append_to_response: "content_ratings" });
    const sinopse = s.overview || (await this.api<Serie>(`/tv/${id}`, { language: "en-US" })).overview || "";
    const episodios: Record<string, EpisodioTmdb> = {};
    for (const t of temporadas) {
      type Temporada = { episodes: { episode_number: number; name: string; overview: string; still_path: string | null; runtime: number | null }[] };
      try {
        const temporada = await this.api<Temporada>(`/tv/${id}/season/${t}`, { language: "pt-BR" });
        for (const e of temporada.episodes) {
          // Nome genérico ("Episódio 5") quando não há tradução: o TMDB devolve assim; fica como está.
          episodios[chaveEpisodio(t, e.episode_number)] = { nome: e.name, sinopse: e.overview, cena: this.imagem(e.still_path, "original"), duracao: e.runtime || null };
        }
      } catch (erro) { console.error(`TMDB: temporada ${t} de ${s.name} indisponível: ${erro instanceof Error ? erro.message : erro}`); }
    }
    return {
      tmdbId: s.id, titulo: s.name, tituloOriginal: s.original_name, sinopse, generos: s.genres.map((g) => g.name),
      ano: s.first_air_date ? Number(s.first_air_date.slice(0, 4)) : null, duracao: s.episode_run_time[0] ?? null,
      classificacao: s.content_ratings?.results.find((r) => r.iso_3166_1 === "BR")?.rating ?? s.content_ratings?.results.find((r) => r.iso_3166_1 === "US")?.rating ?? "",
      nota: s.vote_average ? Math.round(s.vote_average * 10) : null, estudio: s.networks[0]?.name ?? s.production_companies[0]?.name ?? "",
      poster: this.imagem(s.poster_path, "w780"), fundo: this.imagem(s.backdrop_path, "original"), episodios
    };
  }
}
