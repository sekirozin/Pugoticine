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
  if (/(^|[. _-])(pt-br|pt_br|por|pob)([. _-]|$)/.test(value)) return "pt-BR";
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

export function scanCatalog(root: string): MediaItem[] {
  const resolvedRoot = path.resolve(root);
  const files = walk(resolvedRoot);
  const subtitlesByDirectory = new Map<string, Subtitle[]>();
  for (const file of files) {
    if (!subtitleExtensions.has(path.extname(file).toLowerCase())) continue;
    const relative = path.relative(resolvedRoot, file);
    const language = subtitleLanguage(path.basename(file));
    const subtitle: Subtitle = {
      id: stableId(relative),
      label: language === "pt-BR" ? "Português (Brasil)" : language === "en" ? "English" : path.basename(file),
      language,
      path: file
    };
    const directory = path.dirname(file);
    subtitlesByDirectory.set(directory, [...(subtitlesByDirectory.get(directory) ?? []), subtitle]);
  }

  return files.flatMap((file): MediaItem[] => {
    const extension = path.extname(file).toLowerCase();
    if (!videoExtensions.has(extension) || path.basename(file).includes(".tmp.")) return [];
    const relativePath = path.relative(resolvedRoot, file);
    const topDirectory = relativePath.split(path.sep)[0] || path.basename(file, extension);
    const { title, year } = mediaTitle(topDirectory);
    const stat = fs.statSync(file);
    const subtitles = (subtitlesByDirectory.get(path.dirname(file)) ?? [])
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
