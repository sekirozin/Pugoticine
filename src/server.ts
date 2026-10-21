import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { getProfile } from "./auth.js";
import { Catalog } from "./catalog.js";
import { config } from "./config.js";
import { streamFile, subtitleToVtt } from "./media.js";
import { MetadataCatalog } from "./metadata.js";
import { createPlaybackPlan } from "./playback.js";
import { ProbeService } from "./probe.js";
import { Store } from "./store.js";
import { Transcoder } from "./transcoder.js";
import type { PlaybackPlan, PlaybackRequest, PugotiProfile } from "./types.js";

fs.mkdirSync(config.dataDir, { recursive: true });
const catalog = new Catalog(config.mediaRoot);
const store = new Store(config.dbFile);
const metadata = new MetadataCatalog();
const probe = new ProbeService(path.join(config.dataDir, "probe-cache.json"));
const transcoder = new Transcoder(path.join(config.dataDir, "transcodes"));
const playbackPlans = new Map<string, { userId: string; mediaId: string; plan: PlaybackPlan; createdAt: number }>();
let lastScanAt = "";

function scan(): void {
  const items = catalog.scan();
  lastScanAt = new Date().toISOString();
  console.log(`Catálogo atualizado: ${items.length} mídia(s).`);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function body<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as T : {} as T;
}

async function authenticated(req: IncomingMessage, res: ServerResponse): Promise<PugotiProfile | null> {
  const profile = await getProfile(req);
  if (!profile) json(res, 401, { error: "Entre com sua conta Pugotilab.", loginUrl: config.pugotilabLoginUrl });
  return profile;
}

function publicMedia() {
  return catalog.list().map((media) => metadata.enrich(media)).map(({ absolutePath: _absolutePath, ...item }) => item);
}

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const profile = await authenticated(req, res);
  if (!profile) return;
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/api/bootstrap" && req.method === "GET") {
    json(res, 200, { profile, media: publicMedia(), progress: store.listProgress(profile.username), lastScanAt });
    return;
  }
  if (url.pathname === "/api/catalog/scan" && req.method === "POST") {
    if (profile.role !== "admin") { json(res, 403, { error: "Apenas administradores podem atualizar o catálogo." }); return; }
    scan();
    await metadata.refresh();
    json(res, 200, { media: publicMedia(), lastScanAt });
    return;
  }
  if (url.pathname === "/api/progress" && req.method === "POST") {
    const input = await body<{ mediaId?: string; position?: number; duration?: number }>(req);
    const media = catalog.get(String(input.mediaId ?? ""));
    if (!media) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    json(res, 200, { progress: store.saveProgress(profile.username, media.id, Number(input.position), Number(input.duration)) });
    return;
  }

  const playbackMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/playback$/);
  if (playbackMatch && req.method === "POST") {
    const media = catalog.get(playbackMatch[1]);
    if (!media) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    const request = await body<PlaybackRequest>(req);
    const technical = probe.analyze(media);
    const plan = createPlaybackPlan(media, technical, request);
    if (plan.mode === "direct") {
      json(res, 200, { plan, technical, url: `/api/media/${media.id}/stream` });
      return;
    }
    const sessionId = crypto.randomUUID();
    playbackPlans.set(sessionId, { userId: profile.username, mediaId: media.id, plan, createdAt: Date.now() });
    json(res, 200, { plan, technical, url: `/api/media/${media.id}/hls/index.m3u8?session=${sessionId}` });
    return;
  }

  const directMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/stream$/);
  if (directMatch && req.method === "GET") {
    const media = catalog.get(directMatch[1]);
    if (!media) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    streamFile(media.absolutePath, req.headers.range, res);
    return;
  }
  const subtitleMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/subtitles\/([a-f0-9]{24})\.vtt$/);
  if (subtitleMatch && req.method === "GET") {
    const subtitle = catalog.get(subtitleMatch[1])?.subtitles.find((item) => item.id === subtitleMatch[2]);
    if (!subtitle) { json(res, 404, { error: "Legenda não encontrada." }); return; }
    res.writeHead(200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=3600" });
    res.end(subtitleToVtt(subtitle.path));
    return;
  }
  const embeddedSubtitleMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/embedded-subtitles\/(\d+)\.vtt$/);
  if (embeddedSubtitleMatch && req.method === "GET") {
    const media = catalog.get(embeddedSubtitleMatch[1]);
    if (!media) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    const technical = probe.analyze(media);
    const streamIndex = Number(embeddedSubtitleMatch[2]);
    const subtitle = technical.subtitleTracks.find((track) => track.streamIndex === streamIndex && track.kind === "text");
    if (!subtitle) { json(res, 404, { error: "Legenda interna não encontrada ou incompatível." }); return; }
    res.writeHead(200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=3600" });
    const process = transcoder.textSubtitleProcess(media, streamIndex);
    process.stdout?.pipe(res);
    process.stderr?.on("data", (chunk) => console.error(`Falha na legenda de ${media.title}: ${String(chunk).trim()}`));
    res.once("close", () => { if (process.exitCode === null) process.kill("SIGTERM"); });
    return;
  }
  const playlistMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/hls\/index\.m3u8$/);
  if (playlistMatch && req.method === "GET") {
    const media = catalog.get(playlistMatch[1]);
    if (!media) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    const sessionId = url.searchParams.get("session") ?? "";
    const session = playbackPlans.get(sessionId);
    if (!session || session.userId !== profile.username || session.mediaId !== media.id || Date.now() - session.createdAt > 60 * 60 * 1000) {
      json(res, 403, { error: "Sessão de reprodução inválida ou expirada." }); return;
    }
    const playlist = await transcoder.playlist(profile.username, media, probe.analyze(media), session.plan);
    res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" });
    fs.createReadStream(playlist).pipe(res);
    return;
  }
  const stopHlsMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/hls$/);
  if (stopHlsMatch && req.method === "DELETE") {
    transcoder.stopSession(profile.username, stopHlsMatch[1]);
    for (const [id, session] of playbackPlans) {
      if (session.userId === profile.username && session.mediaId === stopHlsMatch[1]) playbackPlans.delete(id);
    }
    json(res, 200, { stopped: true });
    return;
  }
  const segmentMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/hls\/(segment-\d{5}\.ts)$/);
  if (segmentMatch && req.method === "GET") {
    const file = transcoder.segment(profile.username, segmentMatch[1], segmentMatch[2]);
    if (!file) { json(res, 404, { error: "Segmento ainda não disponível." }); return; }
    res.writeHead(200, { "content-type": "video/mp2t", "cache-control": "private, max-age=86400" });
    fs.createReadStream(file).pipe(res);
    return;
  }
  json(res, 404, { error: "Rota não encontrada." });
}

async function staticFile(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = requested === "vendor/hls.min.js" ? config.vendorHlsFile : path.resolve(config.publicDir, requested);
  if (requested !== "vendor/hls.min.js" && !file.startsWith(config.publicDir)) { res.writeHead(403).end(); return; }
  try {
    const data = await fsPromises.readFile(file);
    const extension = path.extname(file);
    const contentType = extension === ".html" ? "text/html; charset=utf-8"
      : extension === ".css" ? "text/css; charset=utf-8"
        : extension === ".js" ? "text/javascript; charset=utf-8"
          : extension === ".svg" ? "image/svg+xml" : "application/octet-stream";
    res.writeHead(200, { "content-type": contentType, "cache-control": extension === ".svg" ? "public, max-age=86400" : "no-cache" });
    res.end(data);
  } catch {
    const index = await fsPromises.readFile(path.join(config.publicDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    res.end(index);
  }
}

scan();
metadata.refresh().catch((error) => console.error("Falha ao atualizar metadados:", error));
const scanTimer = setInterval(() => {
  scan();
  metadata.refresh().catch((error) => console.error("Falha ao atualizar metadados:", error));
  for (const [id, session] of playbackPlans) {
    if (Date.now() - session.createdAt > 60 * 60 * 1000) playbackPlans.delete(id);
  }
}, config.scanIntervalMs);
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/health") { json(res, 200, { status: "ok", media: catalog.list().length, lastScanAt }); return; }
    if (req.url?.startsWith("/api/")) await handleApi(req, res);
    else await staticFile(req, res);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error instanceof Error ? error.message : "Erro interno." });
  }
});

function shutdown(): void {
  clearInterval(scanTimer);
  transcoder.stop();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.listen(config.port, () => console.log(`Pugoticine rodando em http://localhost:${config.port}`));
