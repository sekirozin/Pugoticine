import path from "node:path";
import { config } from "./config.js";
import type { MediaItem, MediaMetadata } from "./types.js";
import { chaveEpisodio, Tmdb, type DadosTmdb } from "./tmdb.js";

type RadarrImage = { coverType?: string; remoteUrl?: string };
type RadarrMovie = {
  title?: string;
  originalTitle?: string;
  year?: number;
  path?: string;
  tmdbId?: number;
  overview?: string;
  studio?: string;
  runtime?: number;
  certification?: string;
  genres?: string[];
  images?: RadarrImage[];
  ratings?: {
    tmdb?: { value?: number };
    metacritic?: { value?: number };
    rottenTomatoes?: { value?: number };
  };
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function image(movie: RadarrMovie, type: string): string {
  return movie.images?.find((item) => item.coverType === type)?.remoteUrl ?? "";
}

function toMetadata(movie: RadarrMovie): MediaMetadata {
  const metacritic = Number(movie.ratings?.metacritic?.value || 0);
  const rotten = Number(movie.ratings?.rottenTomatoes?.value || 0);
  return {
    tmdbId: movie.tmdbId || null,
    originalTitle: movie.originalTitle || movie.title || "",
    overview: movie.overview || "",
    studio: movie.studio || "",
    runtime: movie.runtime || null,
    certification: movie.certification || "",
    genres: movie.genres || [],
    posterUrl: image(movie, "poster"),
    backdropUrl: image(movie, "fanart"),
    audienceScore: movie.ratings?.tmdb?.value ? Math.round(movie.ratings.tmdb.value * 10) : null,
    criticScore: rotten || metacritic || null,
    criticSource: rotten ? "Rotten Tomatoes" : metacritic ? "Metacritic" : ""
  };
}

type Serie = { id: string; nome: string; temporada: number; episodio: number; episodioFinal: number | null; nomeEpisodio: string | null };
type ItemComSerie = MediaItem & { serie?: Serie };

function deTmdb(d: DadosTmdb, base?: MediaMetadata): MediaMetadata {
  return {
    tmdbId: d.tmdbId, originalTitle: d.tituloOriginal || base?.originalTitle || "", overview: d.sinopse || base?.overview || "",
    studio: d.estudio || base?.studio || "", runtime: d.duracao ?? base?.runtime ?? null, certification: d.classificacao || base?.certification || "",
    genres: d.generos.length ? d.generos : base?.genres ?? [], posterUrl: d.poster || base?.posterUrl || "", backdropUrl: d.fundo || base?.backdropUrl || "",
    audienceScore: d.nota ?? base?.audienceScore ?? null, criticScore: base?.criticScore ?? null, criticSource: base?.criticSource ?? "", year: d.ano
  };
}
const nomeGenerico = (nome: string) => /^(epis[óo]dio|episode)\s*\d+$/i.test(nome.trim());

export class MetadataCatalog {
  private movies: RadarrMovie[] = [];
  constructor(private readonly tmdb: Tmdb | null = null) {}

  async refresh(): Promise<void> {
    if (!config.radarrUrl || !config.radarrApiKey) return;
    const response = await fetch(`${config.radarrUrl}/api/v3/movie`, {
      headers: { "X-Api-Key": config.radarrApiKey },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`Radarr respondeu ${response.status}.`);
    this.movies = await response.json() as RadarrMovie[];
    console.log(`Metadados Radarr atualizados: ${this.movies.length} título(s).`);
  }

  /** Radarr primeiro (ID do TMDB e notas da crítica); por cima, o TMDB em português (filmes e séries). */
  enrich<T extends MediaItem>(item: T): T {
    const radarr = this.enrichRadarr(item);
    if (!this.tmdb) return radarr;
    const comSerie = radarr as T & ItemComSerie;
    if (comSerie.serie) {
      const s = this.tmdb.serie(Tmdb.chaveSerie(item));
      if (!s) return radarr;
      const e = s.episodios[chaveEpisodio(comSerie.serie.temporada, comSerie.serie.episodio)];
      const nomeArquivo = comSerie.serie.nomeEpisodio;
      const nomeEpisodio = e?.nome && !nomeGenerico(e.nome) ? e.nome : nomeArquivo;
      const serie = { ...comSerie.serie, nome: s.titulo || comSerie.serie.nome, nomeEpisodio };
      const rotulo = `T${serie.temporada}E${String(serie.episodio).padStart(2, "0")}${serie.episodioFinal ? `-E${String(serie.episodioFinal).padStart(2, "0")}` : ""}`;
      return { ...radarr, title: `${serie.nome} · ${rotulo}`, serie,
        metadata: { ...deTmdb(s), runtime: e?.duracao ?? s.duracao, stillUrl: e?.cena || "", episodeOverview: e?.sinopse || "" } };
    }
    const f = this.tmdb.filme(Tmdb.chaveFilme(item));
    return f ? { ...radarr, title: f.titulo || radarr.title, year: radarr.year || f.ano, metadata: deTmdb(f, radarr.metadata) } : radarr;
  }

  private enrichRadarr<T extends MediaItem>(item: T): T {
    const folder = item.relativePath.split(path.sep)[0] ?? "";
    const normalizedFolder = normalize(folder.replace(/\s*\((?:19|20)\d{2}\)\s*$/, ""));
    const normalizedTitle = normalize(item.title);
    const movie = this.movies.find((candidate) => {
      const candidateFolder = candidate.path ? normalize(path.basename(candidate.path).replace(/\s*\((?:19|20)\d{2}\)\s*$/, "")) : "";
      const titleMatches = candidateFolder === normalizedFolder || normalize(candidate.title || "") === normalizedTitle;
      return titleMatches && (!item.year || !candidate.year || item.year === candidate.year);
    });
    return movie ? { ...item, year: item.year || movie.year || null, metadata: toMetadata(movie) } : item;
  }
}
