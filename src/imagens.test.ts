// PQA-224: imagens dos títulos — pôster 2:3 e fundo 16:9 em WebP nos tamanhos padronizados, em cache; quadro do vídeo
// quando não há imagem do Radarr (ou ela falha); pedidos iguais simultâneos geram uma vez só.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Imagens, larguraPadronizada } from "./imagens.js";
import type { MediaItem } from "./types.js";

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "imagens-"));
const video = path.join(pasta, "Filme (2020).mkv");
assert.equal(spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24:duration=20", "-c:v", "libx264", "-preset", "ultrafast", video]).status, 0);
const st = fs.statSync(video);
const media = { id: "c".repeat(24), title: "Filme", absolutePath: video, size: st.size, modifiedAt: st.mtime.toISOString() } as MediaItem;
let geracoes = 0;
const imagens = new Imagens(path.join(pasta, "cache"), "ffmpeg", () => { geracoes++; return 20; });
const dimensoes = (arquivo: string) => { const s = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "json", arquivo], { encoding: "utf8" }).stdout).streams[0]; return [s.codec_name, s.width, s.height]; };
test.after(() => fs.rmSync(pasta, { recursive: true, force: true }));

test("PQA-224: tamanhos padronizados", () => {
  assert.equal(larguraPadronizada("poster", 300), 342);
  assert.equal(larguraPadronizada("poster", 5000), 780);
  assert.equal(larguraPadronizada("fundo", 1000), 1280);
});

test("PQA-224: quadro do vídeo vira pôster 2:3 e fundo 16:9 em WebP, com cache e sem gerar duas vezes", async () => {
  const [a, b] = await Promise.all([imagens.caminho(media, "poster", 300, ""), imagens.caminho(media, "poster", 342, "")]);
  assert.equal(a, b, "mesmo arquivo para o mesmo tamanho padronizado");
  assert.equal(geracoes, 1, "pedidos simultâneos geram uma vez");
  assert.deepEqual(dimensoes(a), ["webp", 342, 513]);
  const fundo = await imagens.caminho(media, "fundo", 1280, "");
  assert.deepEqual(dimensoes(fundo), ["webp", 1280, 720]);
  const t0 = Date.now();
  assert.equal(await imagens.caminho(media, "poster", 342, ""), a);
  assert.ok(Date.now() - t0 < 50, "segunda vez vem do cache");
});

test("PQA-224: imagem do Radarr quando existe; se ela falha, quadro do vídeo", async () => {
  const png = path.join(pasta, "remota.png");
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=1000x1500", "-frames:v", "1", png]);
  const servidor = http.createServer((req, res) => { if (req.url === "/poster.png") { res.writeHead(200, { "content-type": "image/png" }); res.end(fs.readFileSync(png)); } else { res.writeHead(404); res.end(); } });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
  try {
    const porta = (servidor.address() as { port: number }).port;
    const remota = await imagens.caminho(media, "poster", 500, `http://127.0.0.1:${porta}/poster.png`);
    assert.deepEqual(dimensoes(remota), ["webp", 500, 750]);
    const cor = spawnSync("ffmpeg", ["-v", "error", "-i", remota, "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout;
    assert.ok(cor[0] > 200 && cor[1] < 60, "é a imagem remota (vermelha), não um quadro do vídeo");
    const queda = await imagens.caminho(media, "poster", 185, `http://127.0.0.1:${porta}/nao-existe.png`);
    assert.deepEqual(dimensoes(queda), ["webp", 185, 278]);
    assert.notEqual(imagens.versao(media, "a"), imagens.versao(media, "b"), "imagem remota diferente = endereço novo");
    assert.notEqual(imagens.versao(media, ""), imagens.versao({ ...media, modifiedAt: "2030-01-01T00:00:00.000Z" }, ""), "arquivo trocado = endereço novo");
  } finally { servidor.close(); }
});
