// PQA-234: como no Jellyfin (dashboard AppLayout + AppDrawer), ao entrar no Painel o menu do Painel substitui o menu
// lateral do app; o cabeçalho (ícone, nome, versão) volta ao início e o menu normal reaparece. Desktop: menu fixo de
// 240 px e conteúdo ao lado; celular: abre pelo botão de menu e fecha ao escolher uma tela. A barra superior não muda.
// Uso: node test/browser-painel-drawer.mjs  (cópia isolada em 127.0.0.1:3022)
import assert from "node:assert/strict";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3022";
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
async function abrir(vp, celular = false) {
  const contexto = await navegador.newContext({ viewport: vp, isMobile: celular, hasTouch: celular });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", e => erros.push(String(e)));
  await page.goto(BASE);
  await page.waitForSelector(".media-card");
  return page;
}
const caixa = (page, sel) => page.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: Math.round(r.left), d: Math.round(r.right), w: Math.round(r.width) } : null; }, sel);
const visivel = (page, sel) => page.locator(sel).first().isVisible();
try {
  // Desktop.
  const d = await abrir({ width: 1440, height: 900 });
  const barra = await d.locator(".topbar").innerHTML();
  assert.ok(await visivel(d, '#sidebar > nav [data-view="home"]'), "menu do app antes");
  await d.evaluate(() => document.querySelector("#painel-button").click());
  await d.waitForSelector("#painel-drawer [data-painel-ir]");
  assert.equal(await visivel(d, '#sidebar > nav [data-view="home"]'), false, "menu do app some no Painel");
  assert.equal(await d.locator(".painel-app .painel-menu").count(), 0, "sem segunda coluna de menu no conteúdo");
  await d.waitForFunction(() => Math.round(document.querySelector("#sidebar").getBoundingClientRect().width) === 240, null, { timeout: 3000 }); // fim da transição
  assert.deepEqual((await caixa(d, "#sidebar")).w, 240, "menu do Painel com 240 px, como o drawer do Jellyfin");
  assert.ok((await caixa(d, "[data-painel-conteudo]")).x >= 240, "conteúdo ao lado do menu");
  assert.match(await d.locator(".painel-drawer-topo").innerText(), /PugotiCine[\s\S]*\d+\.\d+\.\d+/, "cabeçalho com nome e versão");
  await d.locator('[data-painel-ir="geral"]').click();
  await d.waitForSelector('[name="ServerName"]');
  assert.equal(await d.locator(".topbar").innerHTML(), barra, "barra superior intacta");
  await d.locator("[data-painel-inicio]").click();
  await d.waitForSelector('#sidebar > nav [data-view="home"]', { state: "visible" });
  assert.equal(await d.locator("#painel-drawer").count(), 0, "menu do Painel removido ao sair");
  assert.ok(await visivel(d, ".media-card"), "voltou ao início");
  await d.waitForFunction(() => document.querySelector("#sidebar").getBoundingClientRect().width < 100, null, { timeout: 3000 });
  assert.ok((await caixa(d, "#sidebar")).w < 240, "menu normal do app de volta");

  // Celular.
  const c = await abrir({ width: 390, height: 844 }, true);
  await c.evaluate(() => document.querySelector("#painel-button").click());
  await c.waitForSelector("[data-painel-titulo]");
  assert.ok((await caixa(c, "#sidebar")).d <= 1, "menu do Painel fechado no celular");
  await c.locator("#menu-toggle").click();
  await c.waitForFunction(() => document.querySelector("#sidebar").getBoundingClientRect().left >= 0 && document.querySelector("#sidebar").classList.contains("open"));
  assert.ok(await visivel(c, '#painel-drawer [data-painel-ir="usuarios"]'), "abre pelo botão de menu");
  assert.equal(await visivel(c, '#sidebar > nav [data-view="home"]'), false);
  const topo = await c.evaluate(() => document.querySelector(".painel-drawer-topo").getBoundingClientRect().top);
  const busca = await c.evaluate(() => document.querySelector(".search").getBoundingClientRect().bottom);
  assert.ok(topo >= busca, "cabeçalho do menu abaixo da busca");
  await c.locator('#painel-drawer [data-painel-ir="usuarios"]').click();
  await c.waitForFunction(() => !document.querySelector("#sidebar").classList.contains("open"));
  assert.equal((await c.locator("[data-painel-titulo]").innerText()).trim(), "Usuários");
  assert.deepEqual(erros, []);
  console.log("PQA-234 ok");
} finally {
  await navegador.close();
}
