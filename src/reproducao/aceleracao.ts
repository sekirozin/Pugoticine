// Detecta o que a GPU faz por VAAPI, como o Jellyfin faz ao validar a aceleração de hardware: codificar H.264
// (h264_vaapi) e decodificar quais codecs. Roda uma vez na inicialização com testes curtos do próprio FFmpeg; se algo
// falhar, aquele recurso fica desligado e o player converte por software.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Aceleracao { dispositivo: string; decodifica: string[] }

function roda(ffmpeg: string, args: string[]): boolean {
  return spawnSync(ffmpeg, ["-hide_banner", "-v", "error", "-y", ...args], { stdio: "ignore", timeout: 20_000 }).status === 0;
}

export function detectarVaapi(ffmpeg: string, dispositivo: string): Aceleracao | null {
  if (!fs.existsSync(dispositivo)) return null;
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "vaapi-"));
  try {
    const h264 = path.join(pasta, "teste-h264.mp4");
    // Codificar H.264 na GPU (o essencial: sem isso não há aceleração).
    if (!roda(ffmpeg, ["-init_hw_device", `vaapi=va:${dispositivo}`, "-filter_hw_device", "va", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24:duration=1",
      "-vf", "format=nv12,hwupload", "-c:v", "h264_vaapi", h264])) return null;
    const decodifica: string[] = [];
    const decodificar = (arquivo: string) => roda(ffmpeg, ["-hwaccel", "vaapi", "-hwaccel_device", dispositivo, "-hwaccel_output_format", "vaapi", "-i", arquivo, "-f", "null", "-"]);
    if (decodificar(h264)) decodifica.push("h264");
    // HEVC e outros: só se a GPU também decodifica (gera a amostra por software; a HD 4600 não decodifica HEVC).
    for (const [codec, encoder, extensao] of [["hevc", "libx265", "mkv"], ["vp9", "libvpx-vp9", "webm"], ["av1", "libsvtav1", "mkv"]] as const) {
      const amostra = path.join(pasta, `teste-${codec}.${extensao}`);
      if (roda(ffmpeg, ["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24:duration=1", "-c:v", encoder, "-pix_fmt", "yuv420p", amostra]) && decodificar(amostra)) decodifica.push(codec);
    }
    return { dispositivo, decodifica };
  }
  finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
