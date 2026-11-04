import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MediaItem, Subtitle } from "./types.js";

const videoExtensions = new Set([".mkv", ".mp4", ".m4v", ".webm", ".avi", ".mov"]);
const subtitleExtensions = new Set([".srt", ".vtt"]);

function stableId(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function subtitleLanguage(fileName: string): Subtitle["language"] {
  const value = fileName.toLowerCase();
  if (/(^|[. _-])(pt-br|pt_br|por|pob|pb)([. _-]|$)/.test(value)) return "pt-BR";
  if (/(^|[. _-])(en|eng|english)([. _-]|$)/.test(value)) return "en";
  return "unknown";
}

function mediaTitle(directory: string): { title: string; year: number | null } {
  const yearMatch = directory.match(/\((19\d{2}|20\d{2})\)\s*$/);
  return {
    title: directory.replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim(),
    year: yearMatch ? Number(yearMatch[1]) : null
  };
}

function walk(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(current);
      else if (entry.isFile()) files.push(current);
    }
  }
  return files;
}

/** Rótulo pelo nome: "<vídeo>.Forçada.pt-BR.srt" → "Forçada"; sem trecho extra, o nome do idioma. */
function subtitleLabel(fileName: string, videoBase: string | null, language: Subtitle["language"]): string {
  const padrao = language === "pt-BR" ? "Português (Brasil)" : language === "en" ? "English" : null;
  if (!videoBase) return padrao ?? fileName;
  const meio = path.basename(fileName, path.extname(fileName)).slice(videoBase.length).replace(/^[. _-]+/, "")
    .replace(/(^|[. _-])(pt-br|pt_br|por|pob|pb|pt|en|eng|english)$/i, "").replace(/[. _-]+$/, "").trim();
  return meio || padrao || fileName;
}

/** A legenda é do vídeo cujo nome (sem extensão) começa o nome dela: "Ep01.pt-BR.srt" → "Ep01.mkv". */
function videoDaLegenda(legenda: string, videos: string[]): string | null {
  const nome = path.basename(legenda).toLowerCase();
  let melhor: string | null = null;
  for (const video of videos) {
    const base = path.basename(video, path.extname(video)).toLowerCase();
    if (nome.startsWith(`${base}.`) && (!melhor || base.length > path.basename(melhor, path.extname(melhor)).length)) melhor = video;
  }
  return melhor;
}

export function scanCatalog(root: string): MediaItem[] {
  const resolvedRoot = path.resolve(root);
  const files = walk(resolvedRoot);
  const isVideo = (file: string) => videoExtensions.has(path.extname(file).toLowerCase()) && !path.basename(file).includes(".tmp.");
  const videosByDirectory = new Map<string, string[]>();
  for (const file of files.filter(isVideo)) videosByDirectory.set(path.dirname(file), [...(videosByDirectory.get(path.dirname(file)) ?? []), file]);

  const subtitlesByVideo = new Map<string, Subtitle[]>();
  for (const file of files) {
    if (!subtitleExtensions.has(path.extname(file).toLowerCase())) continue;
    const videos = videosByDirectory.get(path.dirname(file)) ?? [];
    // Pasta com um vídeo só: qualquer legenda é dele (como antes). Com vários (temporada): só a de mesmo nome.
    const video = videoDaLegenda(file, videos) ?? (videos.length === 1 ? videos[0]! : null);
    if (!video) continue;
    const language = subtitleLanguage(path.basename(file));
    const nomeDoVideo = path.basename(video, path.extname(video));
    const comeca = path.basename(file).toLowerCase().startsWith(`${nomeDoVideo.toLowerCase()}.`);
    const subtitle: Subtitle = {
      id: stableId(path.relative(resolvedRoot, file)),
      label: subtitleLabel(path.basename(file), comeca ? nomeDoVideo : null, language),
      language,
      path: file
    };
    subtitlesByVideo.set(video, [...(subtitlesByVideo.get(video) ?? []), subtitle]);
  }

  return files.flatMap((file): MediaItem[] => {
    if (!isVideo(file)) return [];
    const extension = path.extname(file).toLowerCase();
    const relativePath = path.relative(resolvedRoot, file);
    const topDirectory = relativePath.split(path.sep)[0] || path.basename(file, extension);
    const { title, year } = mediaTitle(topDirectory);
    const stat = fs.statSync(file);
    const subtitles = (subtitlesByVideo.get(file) ?? [])
      .sort((a, b) => ({ "pt-BR": 0, en: 1, unknown: 2 }[a.language] - { "pt-BR": 0, en: 1, unknown: 2 }[b.language]));
    return [{
      id: stableId(relativePath), title, year, relativePath, absolutePath: file,
      fileName: path.basename(file), extension, size: stat.size,
      modifiedAt: stat.mtime.toISOString(), playbackMode: extension === ".mp4" || extension === ".webm" ? "direct" : "hls",
      subtitles
    }];
  }).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

export class Catalog {
  private items = new Map<string, MediaItem>();
  constructor(private readonly root: string) {}
  scan(): MediaItem[] {
    const items = scanCatalog(this.root);
    this.items = new Map(items.map((item) => [item.id, item]));
    return items;
  }
  list(): MediaItem[] { return [...this.items.values()]; }
  get(id: string): MediaItem | null { return this.items.get(id) ?? null; }
}
