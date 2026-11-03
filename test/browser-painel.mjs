// PQA-231: Painel do administrador no navegador real (Chromium do sistema), contra a cópia isolada
// (dev/compose.painel.yml, 127.0.0.1:3022):
//  - o item "Painel" só aparece para administrador; para usuário comum a API responde 403;
//  - o Painel mostra servidor (FFmpeg), contagens da biblioteca e discos;
//  - quem está assistindo (progresso gravado há menos de 60 s) aparece em "Assistindo agora" e na atividade;
//  - "Escanear biblioteca" roda a varredura.
// Uso: node test/browser-painel.mjs [pasta para capturas]
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3022";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
async function pagina(usuario) {
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: `dev-${usuario}`, url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", e => erros.push(`${usuario}: ${e}`));
  await page.goto(BASE);
  await page.waitForSelector(".media-card");
  return page;
}
try {
  // Usuário comum: sem Painel.
  const marcos = await pagina("marcos");
  assert.equal(await marcos.locator("#painel-button").isVisible(), false, "usuário comum não vê o Painel");
  assert.equal(await marcos.evaluate(async () => (await fetch("/api/painel")).status), 403);
  // marcos começa a assistir um filme (o player grava o progresso a cada 15 s).
  const filmes = await marcos.evaluate(async () => (await (await fetch("/api/bootstrap")).json()).media);
  const godfather = filmes.find(f => f.title === "The Godfather");
  assert.equal(await marcos.evaluate(async (id) => (await fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaId: id, position: 30, duration: 60 }) })).status, godfather.id), 200);

  // Administrador.
  const admin = await pagina("sekiro");
  await admin.locator("#menu-toggle").click();
  await admin.locator("#painel-button").click();
  await admin.waitForSelector("[data-painel]");
  // Barra do topo e menu fixos: o Painel começa logo abaixo da barra (antes o ambient-effects.js os deixava
  // relative e o conteúdo descia ~370 px).
  assert.equal(await admin.evaluate(() => getComputedStyle(document.querySelector(".topbar")).position), "fixed");
  assert.equal(await admin.evaluate(() => getComputedStyle(document.querySelector("#player-modal")).position), "fixed");
  assert.ok(await admin.evaluate(() => document.querySelector("[data-painel]").getBoundingClientRect().top) < 140, "Painel logo abaixo da barra do topo");
  const servidor = await admin.locator("[data-painel-servidor]").innerText();
  assert.match(servidor, /PugotiCine/);
  assert.match(servidor, /FFmpeg\s+\d/);
  assert.equal(await admin.locator('[data-contagem="filmes"]').innerText(), String(filmes.length));
  const assistindo = await admin.locator("[data-painel-assistindo]").innerText();
  assert.match(assistindo, /The Godfather/);
  assert.match(assistindo, /marcos · 0:30 de 1:00/);
  assert.match(await admin.locator("[data-painel-atividade]").innerText(), /marcos[\s\S]*The Godfather/);
  assert.match(await admin.locator("[data-painel]").innerText(), /Armazenamento[\s\S]*livres de/);
  if (fotos) await admin.screenshot({ path: path.join(fotos, "painel.png"), fullPage: true });

  // Escanear: a varredura roda e o Painel volta atualizado.
  const antes = await admin.evaluate(async () => (await (await fetch("/api/painel")).json()).bibliotecas[0].ultimaVarredura);
  await admin.locator("[data-painel-varrer]").click();
  await admin.waitForFunction(() => document.querySelector("#toast") && !document.querySelector("#toast").hidden && /Biblioteca atualizada/.test(document.querySelector("#toast").textContent), null, { timeout: 30000 });
  const depois = await admin.evaluate(async () => (await (await fetch("/api/painel")).json()).bibliotecas[0].ultimaVarredura);
  assert.ok(Date.parse(depois) > Date.parse(antes), "nova varredura registrada");
  await admin.waitForSelector("[data-painel-varrer]:not([disabled])");
  assert.deepEqual(erros, []);
  console.log("PQA-231 ok");
} finally {
  await navegador.close();
}
