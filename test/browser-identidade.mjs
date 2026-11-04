// PQA-260/261/262/263 (identidade e segurança do Pugoticine), no Chromium contra o Docker local:
//  PQA-260: aba Marca removida (menu e API) e nenhum CSS personalizado aplicado.
//  PQA-261: Painel só para administradores do PugotiLab: escondido para os outros, inacessível forçando a tela, API 403.
//  PQA-262: todos os ícones da interface são do Tabler (classe icone-tabler / icone-tabler-cheio), nenhum desenhado à mão.
//  PQA-263: nome "Pugoticine" (sem "PugotiCine") e ícone PU/CI na aba, no topo, no menu do Painel e como ícone de app.
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
const iconesForaDoTabler = (page) => page.evaluate(() => [...document.querySelectorAll("svg")]
  .filter((s) => !s.closest("#player video") && !s.classList.contains("icone-tabler") && !s.classList.contains("icone-tabler-cheio"))
  .map((s) => s.outerHTML.slice(0, 120)));
try {
  // ---------- usuário comum ----------
  const comum = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  await comum.addCookies([{ name: "pugotilab_session", value: "dev-marcos", url: BASE }]);
  const p = await comum.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(BASE); await p.waitForSelector(".titulo");
  assert.equal(await p.locator("#painel-button").isVisible(), false, "PQA-261: botão do Painel escondido");
  await p.evaluate(() => { const b = document.querySelector("#painel-button"); b.hidden = false; b.click(); });
  await p.waitForTimeout(500);
  assert.equal(await p.locator(".painel-app, [data-painel-conteudo]").count(), 0, "PQA-261: forçar a tela não abre o Painel");
  assert.equal(await p.locator("body.modo-painel").count(), 0);
  for (const rota of ["/api/painel", "/api/painel/paginas", "/api/painel/config/geral", "/api/painel/usuarios", "/api/painel/backups"]) {
    assert.equal((await p.request.get(`${BASE}${rota}`)).status(), 403, `PQA-261: ${rota} recusada`);
  }
  assert.equal((await p.request.put(`${BASE}/api/painel/config/geral`, { data: { ServerName: "Invasor" } })).status(), 403);
  await comum.close();

  // ---------- administrador ----------
  const admin = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  await admin.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const a = await admin.newPage();
  a.on("pageerror", (e) => erros.push(String(e)));
  await a.goto(BASE); await a.waitForSelector(".titulo");

  // PQA-263: nome e ícone.
  assert.equal(await a.title(), "Pugoticine");
  assert.equal(await a.locator("#brand strong").textContent(), "Pugoticine");
  assert.match(await a.locator("#brand img").getAttribute("src"), /pugoticine-icon\.svg/);
  const icone = await (await a.request.get(`${BASE}/pugoticine-icon.svg`)).text();
  assert.match(icone, /PU\/CI/); assert.match(icone, /#C8FF00/i);
  const links = await a.evaluate(() => [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')].map((l) => l.getAttribute("href")));
  for (const href of links) assert.equal((await a.request.get(`${BASE}${href}`)).status(), 200, `ícone ${href}`);
  const manifesto = await a.request.get(`${BASE}/manifest.webmanifest`);
  assert.match(manifesto.headers()["content-type"], /application\/manifest\+json/);
  assert.equal((await manifesto.json()).name, "Pugoticine");
  assert.equal((await a.request.get(`${BASE}/apple-touch-icon.png`)).headers()["content-type"], "image/png");

  // PQA-262: ícones do Tabler no catálogo, menu, botões, Salas.
  await a.locator(".titulo").first().hover();
  assert.deepEqual(await iconesForaDoTabler(a), [], "PQA-262: catálogo/menu");
  await a.locator("#salas-abrir").click(); await a.waitForTimeout(300);
  assert.deepEqual(await iconesForaDoTabler(a), [], "PQA-262: Salas");
  await a.locator("[data-salas-fechar]").first().click();

  // Painel (admin): sem Marca; ícones do Tabler; nome no topo do menu.
  await a.locator("#painel-button").click();
  await a.waitForSelector(".painel-menu");
  const itens = await a.locator(".painel-menu-item").allTextContents();
  assert.ok(!itens.some((t) => /Marca/.test(t)), `PQA-260: sem Marca no menu (${itens.join(", ")})`);
  assert.equal((await a.request.get(`${BASE}/api/painel/config/marca`)).status(), 404, "PQA-260");
  assert.equal(await a.locator("#css-personalizado").count(), 0, "PQA-260: sem CSS personalizado");
  assert.equal(await a.locator(".painel-drawer-topo strong").textContent(), "Pugoticine");
  assert.match(await a.locator(".painel-drawer-topo img").getAttribute("src"), /pugoticine-icon\.svg/);
  assert.deepEqual(await iconesForaDoTabler(a), [], "PQA-262: Painel");
  assert.ok(!(await a.locator("body").innerText()).includes("PugotiCine"), "PQA-263: sem o nome antigo");
  if (fotos) await a.screenshot({ path: path.join(fotos, "identidade-painel.png") });
  await a.locator("[data-painel-inicio]").click();
  await a.waitForSelector(".titulo");

  // Player: ícones do Tabler e troca play/pausa.
  await a.locator("[data-play]", { hasText: "Teste Longo" }).first().click();
  await a.waitForFunction(() => !document.querySelector("#player-modal").hidden);
  await a.mouse.move(700, 400);
  assert.deepEqual(await iconesForaDoTabler(a), [], "PQA-262: player");
  await a.waitForFunction(() => !document.querySelector("#player").paused, null, { timeout: 30000 });
  assert.equal(await a.locator("#osd-play-icone").getAttribute("data-icone"), "player-pause-cheio");
  if (fotos) await a.screenshot({ path: path.join(fotos, "identidade-player.png") });
  await a.locator("#player-close").click();
  assert.deepEqual(erros, []);
  console.log("PQA-260/261/262/263 ok");
} finally {
  await navegador.close();
}
