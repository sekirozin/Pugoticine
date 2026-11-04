// PQA-270: quatro temas no Perfil, persistência entre cargas/abas e fallback sem armazenamento.
// PQA-271: paletas no catálogo/painel/salas/player, contraste dos botões, CSS personalizado e celular.
// PUGOTICINE_FRONTEND permite conferir o frontend em desenvolvimento contra backend local sem alterar seu container.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";
const BASE = process.env.PUGOTICINE_URL || "http://127.0.0.1:3012";
const frontend = process.env.PUGOTICINE_FRONTEND;
const fotos = process.env.PUGOTICINE_CAPTURAS;
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
const cores = { "1": ["rgb(16, 16, 16)", "rgb(38, 61, 187)"], "2": ["rgb(16, 16, 16)", "rgb(200, 255, 0)"], "3": ["rgb(16, 16, 16)", "rgb(255, 88, 37)"], "4": ["rgb(16, 16, 16)", "rgb(255, 96, 106)"] };
async function contexto(opcoes = {}) {
  const c = await navegador.newContext(opcoes);
  await c.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  if (frontend) await c.route(`${BASE}/**`, async route => {
    const u = new URL(route.request().url());
    const nome = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
    if (nome.includes("/") || !/\.(?:html|css|js|svg)$/.test(nome)) return route.continue();
    try { await route.fulfill({ body: await fs.readFile(path.join(frontend, nome)), contentType: nome.endsWith(".css") ? "text/css" : nome.endsWith(".js") ? "text/javascript" : nome.endsWith(".svg") ? "image/svg+xml" : "text/html" }); }
    catch { await route.continue(); }
  });
  c.on("page", p => p.on("pageerror", e => erros.push(String(e))));
  return c;
}
const estado = p => p.evaluate(() => ({ tema: document.documentElement.dataset.tema, fundo: getComputedStyle(document.body).backgroundColor, meta: document.querySelector('meta[name="theme-color"]').content }));
async function escolher(p, id) {
  if (!(await p.locator("#tema-seletor").isVisible())) await p.locator("#profile-button").click();
  await p.getByLabel("Tema", { exact: true }).selectOption(id);
  assert.equal((await estado(p)).tema, id);
}
function luminancia(cor) {
  const v = cor.match(/[\d.]+/g).slice(0, 3).map(n => Number(n) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
}
try {
  const c = await contexto({ viewport: { width: 1440, height: 950 } });
  const p = await c.newPage(); await p.goto(BASE); await p.waitForSelector(".titulo");
  assert.equal((await estado(p)).tema, "1");
  assert.equal(await p.locator(".topbar").evaluate(e => getComputedStyle(e).position), "fixed");
  assert.equal(await p.locator("#player-modal").evaluate(e => getComputedStyle(e).position), "fixed");
  await p.locator("#profile-button").click();
  assert.equal(await p.locator("#tema-seletor option").count(), 4);
  for (const id of ["2", "3", "4", "1"]) {
    await escolher(p, id);
    assert.equal((await estado(p)).fundo, cores[id][0]);
    assert.equal(await p.evaluate(() => localStorage.getItem("pugoticine:tema")), id);
    await p.reload();await p.waitForSelector(".titulo");
    assert.equal((await estado(p)).tema, id, "preferência sobrevive ao reload");
    assert.equal((await estado(p)).fundo, cores[id][0]);
  }
  // Outra aba acompanha a preferência sem recarregar.
  const outra = await c.newPage();await outra.goto(BASE);await outra.waitForSelector(".titulo");
  await escolher(p, "2");await outra.waitForFunction(() => document.documentElement.dataset.tema === "2");
  await outra.close();
  await p.locator("#profile-button").click();
  await p.evaluate(() => document.querySelector("#painel-button").click());
  await p.waitForSelector('#painel-drawer [data-painel-ir="geral"]');
  await p.locator('[data-painel-ir="geral"]').click();await p.waitForSelector('[data-painel-form] button[type="submit"]');
  for (const id of ["2", "3", "4"]) {
    await escolher(p, id);await p.locator("#profile-button").click();
    const coresBotao = await p.locator('[data-painel-form] button[type="submit"]').evaluate(e => ({ fundo: getComputedStyle(e).backgroundColor, texto: getComputedStyle(e).color }));
    assert.equal(coresBotao.fundo, cores[id][1]);
    assert.equal(coresBotao.texto, "rgb(16, 16, 16)");
    const a = luminancia(coresBotao.fundo), b = luminancia(coresBotao.texto);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05) >= 4.5, `contraste tema ${id}`);
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#player-modal")).getPropertyValue("--osd-destaque").trim()), id === "2" ? "#c8ff00" : id === "3" ? "#ff5825" : "#ff606a");
    if (fotos) await p.screenshot({ path: path.join(fotos, `tema-${id}-painel.png`), fullPage: true });
  }
  await p.locator(".salas-topo").click();
  await p.waitForSelector(".salas-caixa");
  const botaoSala = p.locator('.salas-caixa .sala-botao:not(.secundario):not(.perigo)').first();
  assert.equal(await botaoSala.evaluate(e => getComputedStyle(e).backgroundColor), cores["4"][1]);
  await p.locator("[data-salas-fechar]").click();
  // Marca continua prevalecendo sobre o tema base sem exigir !important.
  await p.evaluate(() => { document.querySelector("#css-personalizado").textContent = '.topbar{background:rgb(12,34,56)}'; });
  await p.waitForFunction(() => getComputedStyle(document.querySelector(".topbar")).backgroundColor === "rgb(12, 34, 56)");
  await escolher(p, "2");
  assert.equal(await p.locator(".topbar").evaluate(e => getComputedStyle(e).backgroundColor), "rgb(12, 34, 56)");
  // Persistência indisponível não impede abrir o app nem trocar a aparência.
  const semStorage = await contexto();
  await semStorage.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Bloqueado", "SecurityError"); } }); });
  const sem = await semStorage.newPage(); await sem.goto(BASE);await sem.waitForSelector(".titulo");
  await escolher(sem, "3");assert.match(await sem.locator("#tema-status").innerText(), /não permitiu salvar/);
  // Celular: botão Perfil e seletor cabem na tela e funcionam por toque.
  const mobile = await contexto({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mobile.newPage();await m.goto(BASE);await m.waitForSelector(".titulo");
  await escolher(m, "4");
  assert.equal(await m.evaluate(() => window.innerWidth), 390, "catálogo não alarga o viewport móvel");
  const caixa = await m.locator("#tema-seletor").boundingBox();assert.ok(caixa.x >= 0 && caixa.x + caixa.width <= 390 && caixa.y + caixa.height <= 844);
  if (fotos) await m.screenshot({ path: path.join(fotos, "tema-4-celular.png") });
  assert.deepEqual(erros, []);
  console.log("PQA-270/271: quatro temas, persistência, abas, contraste, CSS personalizado e celular OK");
} finally { await navegador.close(); }
