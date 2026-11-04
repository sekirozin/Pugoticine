// PQA-281: rotas no navegador (Chromium contra o Pugoticine em Docker). Cada tela tem endereço próprio: o menu
// lateral, a busca, os filtros, os detalhes (com temporada), o player, o Painel e as Salas mudam o endereço;
// recarregar a página volta à mesma tela; Voltar do navegador fecha player/detalhes e volta à tela anterior;
// link direto para o player e Voltar não saem do app; endereços antigos (?play=) e inexistentes são convertidos.
// Rodar: PUGOTICINE_URL=http://127.0.0.1:3017 node test/browser-rotas.mjs [pasta-de-fotos]
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const erros = [];
try {
  // Biblioteca de animes (série com temporadas) na pasta de teste.
  const admin = await navegador.newContext();
  await admin.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const lista = await (await admin.request.get(`${BASE}/api/painel/bibliotecas`)).json();
  if (!lista.bibliotecas.some((b) => b.nome === "Animes")) {
    const r = await admin.request.post(`${BASE}/api/painel/bibliotecas`, { data: { nome: "Animes", tipo: "tvshows", pastas: ["/media/teste/Animes"] } });
    assert.ok(r.ok(), await r.text());
  }
  const bootstrap = await (await admin.request.get(`${BASE}/api/bootstrap`)).json();
  await admin.close();
  const filmes = bootstrap.bibliotecas.find((b) => b.tipo === "movies");
  const animes = bootstrap.bibliotecas.find((b) => b.nome === "Animes");
  const filme = bootstrap.media.find((m) => !m.serie);
  const episodio = bootstrap.media.find((m) => m.serie);
  assert.ok(filmes && animes && filme && episodio, "catálogo de teste com filmes e uma série");

  const contexto = await navegador.newContext({ viewport: { width: 1600, height: 900 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", (e) => erros.push(String(e)));
  const caminho = () => { const u = new URL(page.url()); return decodeURIComponent(u.pathname + u.search); };
  const esperarCaminho = (esperado) => page.waitForFunction((e) => decodeURIComponent(location.pathname + location.search) === e, esperado);
  const playerAberto = () => page.evaluate(() => !document.querySelector("#player-modal").hidden);

  // Início.
  await page.goto(BASE);
  await page.waitForSelector(".titulo");
  assert.equal(caminho(), "/");

  // Menu lateral → /biblioteca/<id>; recarregar mantém a tela.
  await page.locator("#nav-bibliotecas .nav-item", { hasText: "Animes" }).click();
  await esperarCaminho(`/biblioteca/${animes.id}`);
  await page.waitForFunction(() => document.querySelector(".catalogo h1")?.textContent === "Animes");
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".catalogo h1")?.textContent === "Animes");
  assert.equal(await page.locator("#nav-bibliotecas .nav-item.active").textContent(), "Animes");

  // Série: /titulo/<id>, temporada no endereço, Voltar fecha os detalhes.
  await page.locator(".grade .titulo-capa").first().click();
  await page.waitForSelector(".detalhes .episodio");
  await esperarCaminho(`/titulo/${episodio.serie.id}`);
  await page.locator(".temporada-aba").first().click();
  await esperarCaminho(`/titulo/${episodio.serie.id}?temporada=${episodio.serie.temporada}`);
  assert.equal(await page.locator(".catalogo h1").textContent(), "Animes", "detalhes por cima da tela anterior");
  await page.reload();
  await page.waitForSelector(".detalhes .episodio");
  assert.equal(await page.locator('.temporada-aba[aria-selected="true"]').getAttribute("data-temporada"), String(episodio.serie.temporada));
  if (fotos) await page.screenshot({ path: path.join(fotos, "rota-serie.png") });

  // Episódio → /assistir/<id>; Voltar volta aos detalhes da série; outro Voltar à biblioteca.
  await page.locator(".episodio-capa").first().click();
  await page.waitForFunction(() => !document.querySelector("#player-modal").hidden);
  assert.match(caminho(), /^\/assistir\/[0-9a-f]+$/);
  await page.goBack();
  await page.waitForFunction(() => document.querySelector("#player-modal").hidden);
  await page.waitForSelector(".detalhes .episodio");
  assert.match(caminho(), /^\/titulo\//);
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector(".detalhes"));
  await esperarCaminho(`/biblioteca/${animes.id}`);
  await page.goForward();
  await page.waitForSelector(".detalhes .episodio");

  // Esc fecha os detalhes pelo histórico.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".detalhes"));
  await esperarCaminho(`/biblioteca/${animes.id}`);

  // Filtros da biblioteca no endereço.
  await page.locator("#nav-bibliotecas .nav-item", { hasText: "Filmes" }).click();
  await esperarCaminho(`/biblioteca/${filmes.id}`);
  await page.locator('[data-filtro="ordem"]').selectOption("ano");
  await esperarCaminho(`/biblioteca/${filmes.id}?ordem=ano`);
  await page.reload();
  await page.waitForSelector('[data-filtro="ordem"]');
  assert.equal(await page.locator('[data-filtro="ordem"]').inputValue(), "ano");

  // Busca: /busca?q=…; apagar volta à tela anterior.
  await page.locator("#search").fill("godfather");
  await esperarCaminho("/busca?q=godfather");
  await page.waitForFunction(() => /Resultados para/.test(document.querySelector(".catalogo h1")?.textContent ?? ""));
  await page.reload();
  await page.waitForFunction(() => /Resultados para/.test(document.querySelector(".catalogo h1")?.textContent ?? ""));
  assert.equal(await page.locator("#search").inputValue(), "godfather");
  await page.locator("#search").fill("");
  await esperarCaminho("/");

  // Continuar.
  await page.locator('nav [data-view="continue"]').click();
  await esperarCaminho("/continuar");

  // Painel e página do Painel.
  await page.locator("#painel-button").click();
  await esperarCaminho("/painel");
  await page.waitForSelector("[data-painel-titulo]");
  await page.locator('[data-painel-ir="geral"]').click();
  await esperarCaminho("/painel/geral");
  await page.waitForFunction(() => document.querySelector("[data-painel-titulo]")?.textContent === "Geral");
  await page.reload();
  await page.waitForFunction(() => document.querySelector("[data-painel-titulo]")?.textContent === "Geral");
  await page.goto(`${BASE}/painel/nao-existe`);
  await page.waitForSelector("[data-painel-titulo]");
  await esperarCaminho("/painel");
  await page.locator("[data-painel-inicio]").click();
  await esperarCaminho("/");

  // Salas: botão → /salas; Fechar volta.
  await page.locator("#salas-abrir").click();
  await esperarCaminho("/salas");
  await page.waitForFunction(() => !document.querySelector("#salas-painel").hidden);
  await page.locator("[data-salas-fechar]").click();
  await page.waitForFunction(() => document.querySelector("#salas-painel").hidden);
  await esperarCaminho("/");

  // Link direto para o player: abre; fechar não sai do app (vai para o Início).
  await page.goto(`${BASE}/assistir/${filme.id}`);
  await page.waitForFunction(() => !document.querySelector("#player-modal").hidden);
  if (fotos) await page.screenshot({ path: path.join(fotos, "rota-assistir.png") });
  await page.mouse.move(700, 400);
  await page.locator("#player-close").click();
  await page.waitForFunction(() => document.querySelector("#player-modal").hidden);
  await esperarCaminho("/");
  assert.ok(page.url().startsWith(BASE));

  // Endereço antigo ?play= vira /assistir/<id>; inexistente vira o Início.
  await page.goto(`${BASE}/?play=${filme.id}`);
  await page.waitForFunction(() => !document.querySelector("#player-modal").hidden);
  await esperarCaminho(`/assistir/${filme.id}`);
  await page.goto(`${BASE}/qualquer/coisa`);
  await page.waitForSelector(".titulo");
  await esperarCaminho("/");
  await page.goto(`${BASE}/titulo/naoexiste`);
  await page.waitForSelector(".titulo");
  await esperarCaminho("/");
  assert.equal(await playerAberto(), false);

  assert.deepEqual(erros, []);
  console.log("PQA-281 ok");
} finally {
  await navegador.close();
}
