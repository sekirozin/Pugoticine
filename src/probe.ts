import { spawn } from "node:child_process";
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

/** Roda o ffprobe sem bloquear o servidor (antes era spawnSync: o Node inteiro parava até 30 s, inclusive os trechos
 *  de vídeo de quem já estava assistindo e as checagens de sessão, que estouravam o tempo e viravam "deslogado"). */
export function rodarFfprobe(args: string[], tempoLimiteMs: number, ffprobe = "ffprobe"): Promise<string> {
  return new Promise((resolve, reject) => {
    const processo = spawn(ffprobe, args, { stdio: ["ignore", "pipe", "pipe"] });
    const saida: Buffer[] = [];
    let erro = "";
    const limite = setTimeout(() => processo.kill("SIGKILL"), tempoLimiteMs);
    processo.stdout.on("data", (parte: Buffer) => saida.push(parte));
    processo.stderr.on("data", (parte: Buffer) => { if (erro.length < 2000) erro += String(parte); });
    processo.once("error", (e) => { clearTimeout(limite); reject(e); });
    processo.once("close", (codigo) => {
      clearTimeout(limite);
      if (codigo === 0) resolve(Buffer.concat(saida).toString("utf8"));
      else reject(new Error(`ffprobe terminou com ${codigo ?? "sinal"}: ${erro.trim().slice(0, 200)}`));
    });
  });
}

export class ProbeService {
  private cache: ProbeCache;
  private readonly emAndamento = new Map<string, Promise<MediaTechnicalInfo>>();
  constructor(private readonly cacheFile: string) {
    try {
      this.cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as ProbeCache;
      if (this.cache.version !== 1) throw new Error("cache version");
    } catch {
      this.cache = { version: 1, records: {} };
    }
  }
  /** Informação técnica já analisada (sem rodar o ffprobe); null se o arquivo ainda não foi analisado. */
  emCache(media: MediaItem): MediaTechnicalInfo | null {
    const cached = this.cache.records[media.relativePath];
    return cached?.signature === `${media.size}:${media.modifiedAt}` ? cached.info : null;
  }
  async analyze(media: MediaItem): Promise<MediaTechnicalInfo> {
    const pronto = this.emCache(media);
    if (pronto) return pronto;
    const chave = `${media.relativePath}|${media.size}:${media.modifiedAt}`;
    const andamento = this.emAndamento.get(chave);
    if (andamento) return andamento;
    const promessa = (async () => {
      let saida: string;
      try { saida = await rodarFfprobe(["-v", "error", "-show_format", "-show_streams", "-of", "json", media.absolutePath], 30_000); }
      catch { throw new Error(`Não foi possível analisar ${media.title}.`); }
      const info = parseProbeOutput(JSON.parse(saida) as ProbeOutput);
      this.cache.records[media.relativePath] = { signature: `${media.size}:${media.modifiedAt}`, info };
      await fs.promises.mkdir(path.dirname(this.cacheFile), { recursive: true });
      await fs.promises.writeFile(this.cacheFile, JSON.stringify(this.cache));
      return info;
    })();
    this.emAndamento.set(chave, promessa);
    try { return await promessa; } finally { this.emAndamento.delete(chave); }
  }
  /** Analisa em segundo plano, um por vez, o que ainda não está no cache (arquivos novos depois da varredura): assim a
   *  primeira vez que alguém abre o título não espera o ffprobe. Devolve quantos analisou. */
  async aquecer(midias: MediaItem[]): Promise<number> {
    let analisados = 0;
    for (const media of midias) {
      if (this.emCache(media)) continue;
      try { await this.analyze(media); analisados++; } catch { /* arquivo com problema: fica para quando abrirem */ }
    }
    return analisados;
  }
}
