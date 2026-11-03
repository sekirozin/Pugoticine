// PQA-219: o índice do MKV (Cues, porte do MatroskaKeyframeExtractor do Jellyfin) dá os mesmos keyframes que o
// ffprobe percorrendo o arquivo, sem ler os dados de vídeo.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { keyframesFfprobe, keyframesMatroska } from "./keyframes.js";

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "keyframes-"));
test.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
function gerar(nome: string, args: string[]): string {
  const arquivo = path.join(pasta, nome);
  const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=47", "-f", "lavfi", "-i", "sine=duration=47", ...args, "-shortest", arquivo]);
  assert.equal(r.status, 0, String(r.stderr));
  return arquivo;
}

test("PQA-219: keyframes do índice Matroska = ffprobe (GOP fixo e GOP variável)", () => {
  for (const [nome, args] of [
    ["gop-fixo.mkv", ["-c:v", "libx264", "-g", "48", "-c:a", "aac"]],
    ["gop-variavel.mkv", ["-c:v", "libx264", "-g", "250", "-keyint_min", "10", "-sc_threshold", "40", "-c:a", "aac"]]
  ] as const) {
    const arquivo = gerar(nome, [...args]);
    const indice = keyframesMatroska(arquivo), sondado = keyframesFfprobe(arquivo);
    assert.ok(indice.keyframesTicks.length >= 1, nome);
    assert.deepEqual(indice.keyframesTicks.map(t => Math.round(t / 10_000)), sondado.keyframesTicks.map(t => Math.round(t / 10_000)), `${nome}: mesmos keyframes (ms)`);
    assert.ok(Math.abs(indice.duracaoTicks - sondado.duracaoTicks) < 1_000_000, `${nome}: duração ${indice.duracaoTicks} x ${sondado.duracaoTicks}`);
  }
});
