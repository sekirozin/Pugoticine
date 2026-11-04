// PQA-282: marcar obras como assistidas, no Chromium contra o Pugoticine em Docker. Filme, episódio, temporada e série
// inteira são marcados/desmarcados pela janela de detalhes; o cartão ganha o selo de assistido; o Início (destaque,
// "Adicionados recentemente", gêneros) e "Títulos parecidos" recomendam só o que não foi assistido; "A seguir" leva ao
// próximo episódio não assistido; a marcação sobrevive a recarregar a página; a API recusa pedidos inválidos.
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--mute-audio"] });
const erros = [];
try {
  // Biblioteca de animes (pasta de teste) e tudo desmarcado antes de começar.
  const admin = await navegador.newContext();
  await admin.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const lista = await (await admin.request.get(`${BASE}/api/painel/bibliotecas`)).json();
  if (!lista.bibliotecas.some((b) => b.nome === "Animes")) {
    const r = await admin.request.post(`${BASE}/api/painel/bibliotecas`, { data: { nome: "Animes", tipo: "tvshows", pastas: ["/media/teste/Animes"] } });
    assert.ok(r.ok(), await r.text());
  }
  const inicial = await (await admin.request.get(`${BASE}/api/bootstrap`)).json();
  const todos = inicial.media.map((m) => m.id);
  const limpar = await admin.request.post(`${BASE}/api/progress/assistido`, { data: { mediaIds: todos, assistido: false } });
  assert.ok(limpar.ok(), await limpar.text());
  // API: pedidos inválidos.
  assert.equal((await admin.request.post(`${BASE}/api/progress/assistido`, { data: { mediaIds: [], assistido: true } })).status(), 400);
  assert.equal((await admin.request.post(`${BASE}/api/progress/assistido`, { data: { mediaIds: [todos[0]], assistido: "sim" } })).status(), 400);
  assert.equal((await admin.request.post(`${BASE}/api/progress/assistido`, { data: { mediaIds: ["0".repeat(24)], assistido: true } })).status(), 404);
  await admin.close();

  const contexto = await navegador.newContext({ viewport: { width: 1600, height: 900 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto(BASE);
  await page.waitForSelector(".titulo");
  const recomendados = () => page.evaluate(() => [...document.querySelectorAll(".destaque [data-detalhes], .fileira:not([aria-label='Continuar assistindo']):not([aria-label='A seguir']) [data-detalhes]")].map((b) => b.dataset.detalhes));

  // ---------- filme ----------
  await page.locator("#nav-bibliotecas .nav-item", { hasText: "Filmes" }).click();
  await page.waitForFunction(() => document.querySelector(".catalogo h1")?.textContent === "Filmes");
  const filme = await page.locator(".grade .titulo-capa").first().getAttribute("data-detalhes");
  await page.locator(".grade .titulo-capa").first().click();
  const botaoFilme = page.locator(".detalhes .botao-marcar");
  assert.equal(await botaoFilme.textContent(), "Marcar como assistido");
  await botaoFilme.click();
  await page.waitForFunction(() => document.querySelector(".detalhes .botao-marcar")?.getAttribute("aria-pressed") === "true");
  assert.equal(await page.locator(".detalhes .botao-marcar").textContent(), "Assistido");
  const parecidos = await page.locator(".detalhes-parecidos [data-detalhes]").evaluateAll((els) => els.map((e) => e.dataset.detalhes));
  assert.ok(!parecidos.includes(filme));
  if (fotos) await page.screenshot({ path: path.join(fotos, "filme-assistido.png") });
  await page.keyboard.press("Escape");
  // A grade da biblioteca continua mostrando tudo, com o selo.
  assert.equal(await page.locator(`.grade [data-detalhes="${filme}"] .titulo-visto`).count(), 1);
  if (fotos) await page.screenshot({ path: path.join(fotos, "biblioteca-selo.png") });
  // Início: o filme assistido sai das recomendações (destaque, recentes, gêneros).
  await page.locator(".nav-item[data-view=home]").click();
  await page.waitForSelector(".fileiras");
  assert.ok(!(await recomendados()).includes(filme), "filme assistido não é recomendado");

  // ---------- série: episódio, temporada, série ----------
  await page.locator("#nav-bibliotecas .nav-item", { hasText: "Animes" }).click();
  await page.waitForFunction(() => document.querySelector(".catalogo h1")?.textContent === "Animes");
  const serie = await page.locator(".grade .titulo-capa").first().getAttribute("data-detalhes");
  await page.locator(".grade .titulo-capa").first().click();
  await page.waitForSelector(".detalhes .episodio");
  // Episódio 1 marcado: o botão principal passa a oferecer T1E02.
  await page.locator(".episodio-marcar").first().click();
  await page.waitForFunction(() => document.querySelector(".episodio-marcar")?.getAttribute("aria-pressed") === "true");
  assert.equal(await page.locator(".episodio.visto").count(), 1);
  assert.match(await page.locator(".detalhes .botao-assistir").textContent(), /Assistir T1E02/);
  assert.equal(await page.locator(".detalhes-topo .botao-marcar").getAttribute("aria-pressed"), "false");
  await page.keyboard.press("Escape");
  await page.locator(".nav-item[data-view=home]").click();
  await page.waitForSelector(".fileira[aria-label='A seguir']");
  assert.match(await page.locator(".fileira[aria-label='A seguir'] .titulo-legenda-ano").first().textContent(), /^T1E02/);
  assert.ok((await recomendados()).includes(serie), "série com episódio por ver continua recomendada");

  // Temporada inteira: a série fica assistida, sai das recomendações e de "A seguir".
  await page.locator(`.fileira[aria-label='A seguir'] [data-detalhes="${serie}"]`).first().click();
  await page.waitForSelector(".detalhes .temporada-acoes .botao-marcar");
  await page.locator(".temporada-acoes .botao-marcar").click();
  await page.waitForFunction(() => document.querySelectorAll(".episodio.visto").length === 3);
  assert.equal(await page.locator(".detalhes-topo .botao-marcar").getAttribute("aria-pressed"), "true");
  if (fotos) await page.screenshot({ path: path.join(fotos, "serie-assistida.png") });
  await page.keyboard.press("Escape");
  assert.ok(!(await recomendados()).includes(serie), "série assistida não é recomendada");
  assert.equal(await page.locator(".fileira[aria-label='A seguir']").count(), 0);

  // Persistência: recarregar mantém as marcações.
  await page.reload();
  await page.waitForSelector(".fileiras");
  assert.ok(!(await recomendados()).includes(serie) && !(await recomendados()).includes(filme));

  // Desmarcar a série inteira: volta às recomendações.
  await page.locator("#nav-bibliotecas .nav-item", { hasText: "Animes" }).click();
  await page.waitForFunction(() => document.querySelector(".catalogo h1")?.textContent === "Animes");
  assert.equal(await page.locator(`.grade [data-detalhes="${serie}"] .titulo-visto`).count(), 1);
  await page.locator(".grade .titulo-capa").first().click();
  await page.locator(".detalhes-topo .botao-marcar").click();
  await page.waitForFunction(() => document.querySelectorAll(".episodio.visto").length === 0);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(`.grade [data-detalhes="${serie}"] .titulo-visto`).count(), 0);
  await page.locator(".nav-item[data-view=home]").click();
  await page.waitForSelector(".fileiras");
  assert.ok((await recomendados()).includes(serie));

  // Desfaz o filme (deixa o ambiente como estava).
  const fim = await contexto.request.post(`${BASE}/api/progress/assistido`, { data: { mediaIds: [filme], assistido: false } });
  assert.ok(fim.ok());
  assert.deepEqual(erros, []);
  console.log("PQA-282 ok");
} finally {
  await navegador.close();
}
