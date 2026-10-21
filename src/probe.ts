import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { MediaItem, MediaTechnicalInfo } from "./types.js";

type ProbeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  bit_rate?: string;
  avg_frame_rate?: string;
  channels?: number;
  channel_layout?: string;
  color_transfer?: string;
  color_space?: string;
  tags?: { language?: string; title?: string };
  disposition?: { default?: number; forced?: number };
};

type ProbeOutput = {
  streams?: ProbeStream[];
  format?: { format_name?: string; duration?: string; bit_rate?: string };
};

type CacheRecord = { signature: string; info: MediaTechnicalInfo };
type ProbeCache = { version: number; records: Record<string, CacheRecord> };
const textSubtitleCodecs = new Set(["subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text"]);

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function frameRate(value: string | undefined): number {
  if (!value) return 0;
  const [numerator, denominator] = value.split("/").map(Number);
  return denominator ? numerator / denominator : number(value);
}

export function parseProbeOutput(output: ProbeOutput): MediaTechnicalInfo {
  const streams = output.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  let audioIndex = 0;
  let subtitleIndex = 0;
  return {
    container: output.format?.format_name?.split(",")[0] ?? "unknown",
    duration: number(output.format?.duration),
    bitrate: number(output.format?.bit_rate),
    video: video ? {
      streamIndex: number(video.index), codec: video.codec_name ?? "unknown", profile: video.profile ?? "",
      width: number(video.width), height: number(video.height), bitrate: number(video.bit_rate),
      frameRate: frameRate(video.avg_frame_rate),
      hdr: ["smpte2084", "arib-std-b67"].includes(video.color_transfer ?? "") || (video.color_space ?? "").includes("bt2020"),
      colorTransfer: video.color_transfer ?? ""
    } : null,
    audioTracks: streams.filter((stream) => stream.codec_type === "audio").map((stream) => ({
      streamIndex: number(stream.index), relativeIndex: audioIndex++, codec: stream.codec_name ?? "unknown",
      language: stream.tags?.language ?? "und", title: stream.tags?.title ?? "", channels: number(stream.channels),
      channelLayout: stream.channel_layout ?? "", default: Boolean(stream.disposition?.default)
    })),
    subtitleTracks: streams.filter((stream) => stream.codec_type === "subtitle").map((stream) => ({
      streamIndex: number(stream.index), relativeIndex: subtitleIndex++, codec: stream.codec_name ?? "unknown",
      language: stream.tags?.language ?? "und", title: stream.tags?.title ?? "",
      kind: textSubtitleCodecs.has(stream.codec_name ?? "") ? "text" as const : "bitmap" as const,
      default: Boolean(stream.disposition?.default), forced: Boolean(stream.disposition?.forced)
    }))
  };
}

export class ProbeService {
  private cache: ProbeCache;
  constructor(private readonly cacheFile: string) {
    try {
      this.cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as ProbeCache;
      if (this.cache.version !== 1) throw new Error("cache version");
    } catch {
      this.cache = { version: 1, records: {} };
    }
  }
  analyze(media: MediaItem): MediaTechnicalInfo {
    const signature = `${media.size}:${media.modifiedAt}`;
    const cached = this.cache.records[media.relativePath];
    if (cached?.signature === signature) return cached.info;
    const result = spawnSync("ffprobe", [
      "-v", "error", "-show_format", "-show_streams", "-of", "json", media.absolutePath
    ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
    if (result.status !== 0) throw new Error(`Não foi possível analisar ${media.title}.`);
    const info = parseProbeOutput(JSON.parse(result.stdout) as ProbeOutput);
    this.cache.records[media.relativePath] = { signature, info };
    fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache));
    return info;
  }
}
