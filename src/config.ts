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
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  // Aceleração da conversão de vídeo, como a "Aceleração de hardware" do Jellyfin: "vaapi" ou "nenhuma".
  aceleracao: process.env.PUGOTICINE_ACELERACAO === "vaapi" ? "vaapi" as const : "nenhuma" as const,
  // TMDB (metadados em português): token de leitura v4, o mesmo do PugotiList.
  tmdbToken: process.env.TMDB_READ_TOKEN ?? "",
  tmdbApiUrl: process.env.TMDB_API_URL ?? "https://api.themoviedb.org/3",
  dispositivoVaapi: process.env.PUGOTICINE_VAAPI_DISPOSITIVO ?? "/dev/dri/renderD128"
};
