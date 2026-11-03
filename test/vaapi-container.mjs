// PQA-222: conversão pela GPU (VAAPI) no PugotiCine em Docker (compose.desenvolvimento.yml com /dev/dri e
// PUGOTICINE_ACELERACAO=vaapi). Pede 720p do filme de teste 1080p (força conversão) e confere: o FFmpeg em uso é o
// h264_vaapi; os segmentos saem em H.264 720p e começam onde a playlist diz (inclusive depois de um salto); mede o tempo.
// Uso: node test/vaapi-container.mjs. Requer docker, ffprobe e o compose no ar com GPU.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const CONTAINER = process.env.PUGOTICINE_CONTAINER ?? "pugoticine-pugoticine-1";
const C = { cookie: "pugotilab_session=dev-marcos", "content-type": "application/json" };
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "vaapi-"));
const log = execFileSync("docker", ["logs", CONTAINER], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
assert.match(log, /Aceleração de vídeo: VAAPI em \/dev\/dri\/renderD128 \(codifica H\.264/, "o servidor detectou a GPU");
const id = (await (await fetch(`${BASE}/api/bootstrap`, { headers: C })).json()).media.find(m => m.title === "Teste Longo").id;
const resposta = await (await fetch(`${BASE}/api/media/${id}/playback`, { method: "POST", headers: C, body: JSON.stringify({ quality: "720", capabilities: { videoCodecs: ["h264"], audioCodecs: ["aac"] } }) })).json();
assert.equal(resposta.plan.mode, "transcode");
const base = BASE + resposta.url.replace("main.m3u8", "");
const playlist = await (await fetch(BASE + resposta.url, { headers: C })).text();
const duracoes = [...playlist.matchAll(/#EXTINF:([\d.]+),/g)].map(m => Number(m[1]));
const baixar = async (nome) => { const t0 = Date.now(); const b = Buffer.from(await (await fetch(base + nome, { headers: C })).arrayBuffer()); fs.writeFileSync(path.join(pasta, nome), b); return Date.now() - t0; };
const sondar = (n) => {
  const junto = path.join(pasta, `j${n}.mp4`);
  fs.writeFileSync(junto, Buffer.concat([fs.readFileSync(path.join(pasta, "init.mp4")), fs.readFileSync(path.join(pasta, `${n}.mp4`))]));
  const s = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-of", "json", junto], { encoding: "utf8" })).streams[0];
  const pts = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", junto], { encoding: "utf8" }).trim().split("\n").map(Number);
  return { ...s, inicio: Math.min(...pts) };
};
try {
  const t0 = await baixar("0.mp4");
  await baixar("init.mp4");
  const processos = execFileSync("docker", ["exec", CONTAINER, "sh", "-c", "ps -o args | grep [f]fmpeg"], { encoding: "utf8" });
  assert.match(processos, /-c:v h264_vaapi/, "FFmpeg converte na GPU");
  const s0 = sondar(0);
  assert.deepEqual([s0.codec_name, s0.width, s0.height], ["h264", 1280, 720]);
  // Salto para ~4 min e mais 5 segmentos seguidos: mede a velocidade da conversão.
  const alvo = 40, inicio = duracoes.slice(0, alvo).reduce((a, b) => a + b, 0);
  const tSalto = await baixar(`${alvo}.mp4`);
  const sAlvo = sondar(alvo);
  assert.ok(Math.abs(sAlvo.inicio - inicio) < 0.05, `segmento ${alvo} começa em ${sAlvo.inicio}, playlist ${inicio}`);
  const t1 = Date.now();
  for (let n = alvo + 1; n <= alvo + 5; n++) await baixar(`${n}.mp4`);
  const porSegmento = (Date.now() - t1) / 5;
  console.log(`GPU: primeiro segmento em ${t0} ms; salto para ${inicio.toFixed(0)} s em ${tSalto} ms; ${porSegmento.toFixed(0)} ms por segmento de 6 s (${(6000 / porSegmento).toFixed(1)}x o tempo real)`);
  console.log("PQA-222 ok");
} finally {
  fs.rmSync(pasta, { recursive: true, force: true });
}
