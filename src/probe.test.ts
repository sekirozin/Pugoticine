import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseProbeOutput, ProbeService } from "./probe.js";
import type { MediaItem } from "./types.js";

test("identifica codecs, faixas e HDR", () => {
  const info = parseProbeOutput({
    format: { format_name: "matroska,webm", duration: "120.5", bit_rate: "8000000" },
    streams: [
      { index: 0, codec_type: "video", codec_name: "hevc", width: 3840, height: 2160, color_transfer: "smpte2084" },
      { index: 1, codec_type: "audio", codec_name: "truehd", channels: 8, tags: { language: "por" }, disposition: { default: 1 } },
      { index: 2, codec_type: "subtitle", codec_name: "hdmv_pgs_subtitle", tags: { language: "por" } }
    ]
  });
  assert.equal(info.video?.hdr, true);
  assert.equal(info.audioTracks[0]?.codec, "truehd");
  assert.equal(info.subtitleTracks[0]?.kind, "bitmap");
});

test("PQA-284: análise do arquivo (ffprobe) não trava o servidor; pedidos simultâneos usam a mesma análise e o cache", async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "probe-"));
  const arquivo = path.join(pasta, "v.mkv");
  assert.equal(spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=24", "-f", "lavfi", "-i", "sine", "-t", "4", "-c:v", "libx264", "-c:a", "aac", arquivo]).status, 0);
  const st = fs.statSync(arquivo);
  const media = { id: "a".repeat(24), title: "V", relativePath: "v.mkv", absolutePath: arquivo, size: st.size, modifiedAt: st.mtime.toISOString() } as MediaItem;
  const probe = new ProbeService(path.join(pasta, "cache.json"));
  assert.equal(probe.emCache(media), null);
  let tiques = 0;
  const relogio = setInterval(() => tiques++, 1);
  const a = probe.analyze(media), b = probe.analyze(media);
  assert.ok(a instanceof Promise, "assíncrona");
  const [ia, ib] = await Promise.all([a, b]);
  clearInterval(relogio);
  assert.ok(tiques > 0, "o servidor continuou atendendo enquanto o ffprobe rodava");
  assert.deepEqual(ia, ib);
  assert.equal(Math.round(ia.duration), 4);
  assert.equal(probe.emCache(media)?.duration, ia.duration, "ficou em cache");
  assert.equal(await new ProbeService(path.join(pasta, "cache.json")).aquecer([media]), 0, "cache salvo em disco: aquecimento não analisa de novo");
  fs.rmSync(pasta, { recursive: true, force: true });
});
