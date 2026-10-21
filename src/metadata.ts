import path from "node:path";
import { config } from "./config.js";
import type { MediaItem, MediaMetadata } from "./types.js";

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

export class MetadataCatalog {
  private movies: RadarrMovie[] = [];

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

  enrich(item: MediaItem): MediaItem {
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
