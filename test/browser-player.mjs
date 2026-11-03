// PQA-220: player no navegador real (Chromium do sistema, com H.264), contra o PugotiCine em Docker
// (compose.desenvolvimento.yml) e o filme de teste de 10 min em 1080p com AC-3 5.1:
//  - começa a tocar rápido; pular para o minuto 5 não converte o meio (o player só pede os trechos do ponto novo);
//  - fechar e abrir de novo retoma no ponto salvo, começando a pedir trechos dali (não do início).
//  - a janela do player aparece na tela (o efeito de fundo tirava o position:fixed dela).
// Uso: node test/browser-player.mjs [pasta para capturas]. Requer `chromium` e o compose no ar.
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const COOKIE = { name: "pugotilab_session", value: "dev-marcos", url: BASE };
const cabecalho = { cookie: "pugotilab_session=dev-sekiro", "content-type": "application/json" };
await fetch(`${BASE}/api/catalog/scan`, { method: "POST", headers: cabecalho });
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const erros = [];
try {
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 860 } });
  await contexto.addCookies([COOKIE]);
  const page = await contexto.newPage();
  page.on("pageerror", e => erros.push(String(e)));
  const pedidos = [];
  page.on("request", r => { const m = r.url().match(/\/hls\/[0-9a-f-]{36}\/(init|\d+)\.mp4/); if (m) pedidos.push(m[1]); });
  let plano = null;
  page.on("response", async r => { if (r.url().endsWith("/playback")) plano = (await r.json().catch(() => null))?.plan; });
  assert.ok(await page.evaluate(() => MediaSource.isTypeSupported('video/mp4; codecs="avc1.640028"')), "Chromium do sistema toca H.264");

  const abrir = async () => {
    await page.goto(BASE);
    await page.locator("[data-play]", { hasText: "Teste Longo" }).first().click();
    await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.currentTime > 0.5 && !v.paused; }, null, { timeout: 60000 });
  };
  const tempo = () => page.evaluate(() => document.querySelector("video").currentTime);

  // 1) Início.
  let t0 = Date.now();
  await abrir();
  const inicio = Date.now() - t0;
  console.log(`plano: ${plano?.mode} (${plano?.reason}); áudio ${plano?.audioCopy ? "copiado" : "convertido para AAC"}; tocou em ${inicio} ms`);
  // A janela do player cobre a tela (position: fixed) e a barra superior continua no topo.
  const janela = await page.locator("#player-modal").boundingBox();
  assert.ok(janela && Math.abs(janela.y) < 1 && janela.height > 800, `player visível na tela: ${JSON.stringify(janela)}`);
  assert.equal(await page.locator(".topbar").evaluate(e => getComputedStyle(e).position), "fixed");
  assert.equal(plano?.mode, "remux", "vídeo H.264 só é reempacotado");

  // 2) Pulo para 5 min.
  pedidos.length = 0;
  t0 = Date.now();
  await page.evaluate(() => { document.querySelector("video").currentTime = 300; });
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v.currentTime > 301 && !v.paused && !v.seeking; }, null, { timeout: 60000 });
  const pulo = Date.now() - t0;
  const numeros = pedidos.filter(p => p !== "init").map(Number);
  console.log(`pulo para 5:00 tocou em ${pulo} ms; trechos pedidos depois do pulo: ${numeros.join(", ")}`);
  assert.ok(numeros.length && Math.min(...numeros) >= 25, "não pediu os trechos do meio do filme");
  if (fotos) await page.screenshot({ path: path.join(fotos, "player-pulo.png") });
  await page.waitForTimeout(3000);
  const antesDeFechar = await tempo();

  // 3) Fechar (salva a posição) e abrir de novo: retoma ali.
  await page.locator("#player-close").click();
  await page.waitForTimeout(800);
  pedidos.length = 0;
  t0 = Date.now();
  await abrir();
  const retomada = Date.now() - t0;
  const posicao = await tempo();
  const primeiros = pedidos.filter(p => p !== "init").map(Number);
  console.log(`retomou em ${posicao.toFixed(1)} s (fechou em ${antesDeFechar.toFixed(1)} s) após ${retomada} ms; primeiros trechos: ${primeiros.slice(0, 4).join(", ")}`);
  assert.ok(Math.abs(posicao - antesDeFechar) < 15, "retomou perto de onde parou");
  assert.ok(Math.min(...primeiros) >= 25, "retomada não começou pelo trecho 0");
  if (fotos) await page.screenshot({ path: path.join(fotos, "player-retomada.png") });
  assert.deepEqual(erros, []);
  console.log("PQA-220 ok");
} finally {
  await navegador.close();
}
