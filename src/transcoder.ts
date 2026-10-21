import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { MediaItem, MediaTechnicalInfo, PlaybackPlan } from "./types.js";

type Session = { process: ChildProcess; directory: string };

export class Transcoder {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly root: string) {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
  }
  async playlist(userId: string, media: MediaItem, info: MediaTechnicalInfo, plan: PlaybackPlan): Promise<string> {
    const key = `${userId}:${media.id}`;
    const directory = path.join(this.root, userId.replace(/[^a-z0-9_-]/gi, "_"), media.id);
    const playlist = path.join(directory, "index.m3u8");
    if (!this.sessions.has(key)) {
      // A stopped event playlist has no ENDLIST and must never be reused.
      fs.rmSync(directory, { recursive: true, force: true });
      fs.mkdirSync(directory, { recursive: true });
      const video = info.video!;
      const selectedAudio = info.audioTracks.find((track) => track.streamIndex === plan.audioStreamIndex);
      const selectedSubtitle = info.subtitleTracks.find((track) => track.streamIndex === plan.subtitleStreamIndex);
      const inputArgs = ["-hide_banner", "-loglevel", "warning", "-probesize", "5M", "-analyzeduration", "5M", "-i", media.absolutePath];
      const mapArgs = plan.mode === "remux" ? ["-map", `0:${video.streamIndex}`] : [];
      const videoArgs: string[] = [];
      if (plan.mode === "remux") {
        videoArgs.push("-c:v", "copy");
      } else {
        const filters: string[] = [];
        if (plan.toneMap) {
          filters.push("zscale=t=linear:npl=100", "format=gbrpf32le", "zscale=p=bt709", "tonemap=hable:desat=0", "zscale=t=bt709:m=bt709:r=tv", "format=yuv420p");
        }
        if (plan.targetHeight) filters.push(`scale=w=-2:h='min(${plan.targetHeight},ih)':force_original_aspect_ratio=decrease`);
        if (selectedSubtitle?.kind === "bitmap") {
          const overlay = `[0:${video.streamIndex}][0:${selectedSubtitle.streamIndex}]overlay`;
          videoArgs.push("-filter_complex", `${overlay}${filters.length ? `,${filters.join(",")}` : ""}[vout]`, "-map", "[vout]");
        } else {
          mapArgs.push("-map", `0:${video.streamIndex}`);
          if (filters.length) videoArgs.push("-vf", filters.join(","));
        }
        const targetBitrate = plan.targetHeight && plan.targetHeight <= 480 ? "1500k" : plan.targetHeight && plan.targetHeight <= 720 ? "3000k" : "6000k";
        videoArgs.push("-c:v", "libx264", "-preset", "superfast", "-crf", "24", "-maxrate", targetBitrate,
          "-bufsize", targetBitrate, "-g", "48", "-keyint_min", "48", "-sc_threshold", "0", "-threads", "2");
      }
      const audioArgs = selectedAudio
        ? ["-map", `0:${selectedAudio.streamIndex}`, ...(selectedAudio.codec === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-ac", "2", "-b:a", "192k"])]
        : ["-an"];
      const process = spawn(config.ffmpegPath, [
        ...inputArgs, ...mapArgs, ...videoArgs, ...audioArgs,
        "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "event", "-hls_flags", "independent_segments+temp_file",
        "-hls_segment_filename", path.join(directory, "segment-%05d.ts"), playlist
      ], { stdio: ["ignore", "ignore", "pipe"] });
      this.sessions.set(key, { process, directory });
      let diagnostics = "";
      process.stderr?.on("data", (chunk) => { diagnostics = `${diagnostics}${chunk}`.slice(-8000); });
      process.once("exit", (code) => {
        this.sessions.delete(key);
        if (code && code !== 255) console.error(`FFmpeg falhou para ${media.title} (${video.codec}, ${plan.mode}, código ${code}): ${diagnostics}`);
      });
    }
    const deadline = Date.now() + 60_000;
    while (!fs.existsSync(playlist) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
    if (!fs.existsSync(playlist)) throw new Error("A transcodificação não iniciou a tempo.");
    return playlist;
  }
  textSubtitleProcess(media: MediaItem, streamIndex: number): ChildProcess {
    return spawn(config.ffmpegPath, [
      "-v", "error", "-i", media.absolutePath, "-map", `0:${streamIndex}`,
      "-c:s", "webvtt", "-f", "webvtt", "pipe:1"
    ], { stdio: ["ignore", "pipe", "pipe"] });
  }
  segment(userId: string, mediaId: string, name: string): string | null {
    if (!/^segment-\d{5}\.ts$/.test(name)) return null;
    const file = path.join(this.root, userId.replace(/[^a-z0-9_-]/gi, "_"), mediaId, name);
    return fs.existsSync(file) ? file : null;
  }
  stopSession(userId: string, mediaId: string): void {
    const key = `${userId}:${mediaId}`;
    const session = this.sessions.get(key);
    if (!session) return;
    session.process.once("exit", () => fs.rmSync(session.directory, { recursive: true, force: true }));
    session.process.kill("SIGTERM");
    this.sessions.delete(key);
  }
  stop(): void {
    for (const session of this.sessions.values()) session.process.kill("SIGTERM");
    this.sessions.clear();
  }
}
