import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  port: Number(process.env.PORT ?? 3012),
  mediaRoot: path.resolve(process.env.MEDIA_ROOT ?? "/media/movies"),
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(root, "data")),
  dbFile: path.resolve(process.env.DB_FILE ?? path.join(root, "data", "pugoticine.db")),
  publicDir: path.resolve(process.env.PUBLIC_DIR ?? path.join(root, "public")),
  vendorHlsFile: path.resolve(root, "node_modules/hls.js/dist/hls.min.js"),
  pugotilabProfileUrl: process.env.PUGOTILAB_PROFILE_URL ?? "http://pugotilab-auth:8080/auth/api/profile",
  pugotilabLoginUrl: process.env.PUGOTILAB_LOGIN_URL ?? "https://pugotilab.com/auth",
  radarrUrl: (process.env.RADARR_URL ?? "").replace(/\/$/, ""),
  radarrApiKey: process.env.RADARR_API_KEY ?? "",
  scanIntervalMs: Number(process.env.SCAN_INTERVAL_MS ?? 15 * 60 * 1000),
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg"
};
