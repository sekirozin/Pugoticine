// PQA-225: Filmes / Séries / Animes separados como no Jellyfin, no Chromium contra o PugotiCine em Docker: o menu
// lateral tem uma entrada por biblioteca; o Início tem "Adicionados recentemente em <biblioteca>"; a biblioteca de
// animes mostra a série num cartão só (com nº de episódios), não episódios soltos; a série abre com temporadas e
// episódios nomeados; o episódio toca no player; filmes não aparecem na biblioteca de animes.
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const erros = [];
try {
  // Garante a biblioteca de animes (pasta de teste montada em /media/teste).
  const admin = await navegador.newContext();
  await admin.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const lista = await (await admin.request.get(`${BASE}/api/painel/bibliotecas`)).json();
  if (!lista.bibliotecas.some((b) => b.nome === "Animes")) {
    const r = await admin.request.post(`${BASE}/api/painel/bibliotecas`, { data: { nome: "Animes", tipo: "tvshows", pastas: ["/media/teste/Animes"] } });
    assert.ok(r.ok(), await r.text());
  }
  await admin.close();

  const contexto = await navegador.newContext({ viewport: { width: 1600, height: 900 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto(BASE);
  await page.waitForSelector(".titulo");

  // Menu lateral: Início, Filmes, Animes (uma por biblioteca).
  const menu = await page.locator("#nav-bibliotecas .nav-item").allTextContents();
  assert.ok(menu.includes("Filmes") && menu.includes("Animes"), `menu: ${menu}`);
  const fileiras = await page.locator(".fileira h2").allTextContents();
  assert.ok(fileiras.includes("Adicionados recentemente em Filmes") && fileiras.includes("Adicionados recentemente em Animes"), JSON.stringify(fileiras));
  assert.ok(!fileiras.some((f) => /Todos os filmes/.test(f)));

  // Biblioteca Animes: um cartão por série, sem filmes nem episódios soltos.
  await page.locator("#nav-bibliotecas .nav-item", { hasText: "Animes" }).click();
  await page.waitForFunction(() => document.querySelector(".catalogo h1")?.textContent === "Animes");
  assert.equal(await page.locator('#nav-bibliotecas .nav-item.active').textContent(), "Animes");
  const nomes = await page.locator(".grade .titulo-legenda-nome").allTextContents();
  assert.equal(nomes.length, 1, `animes: ${nomes}`);
  assert.match(nomes[0], /^(?:Daemons of the Shadow Realm|Daemons do Reino das Sombras)$/, "nome do arquivo ou traduzido pelo TMDB");
  assert.equal(await page.locator(".grade .titulo-selo").textContent(), "3");
  assert.match(await page.locator(".grade .titulo-meta em").textContent(), /1 temporada · 3 episódios/);
  if (fotos) await page.screenshot({ path: path.join(fotos, "biblioteca-animes.png") });

  // Série: temporadas e episódios.
  await page.locator(".grade .titulo-capa").first().click();
  await page.waitForSelector(".detalhes .episodio");
  assert.deepEqual(await page.locator(".temporada-aba").allTextContents(), ["Temporada 1"]);
  const episodios = await page.locator(".episodio-info h4").allTextContents();
  assert.equal(episodios.length, 3);
  assert.match(episodios[0], /^1\.\s+\S/, "número e nome (do arquivo, do TMDB ou \"Episódio 1\")");
  assert.match(episodios[2], /^3\.\s+\S/);
  if (fotos) await page.screenshot({ path: path.join(fotos, "serie-detalhes.png") });
  await page.locator(".episodio-capa").nth(1).click();
  await page.waitForFunction(() => !document.querySelector("#player-modal").hidden);
  assert.match(await page.locator("#player-title").textContent(), /(?:Daemons of the Shadow Realm|Daemons do Reino das Sombras) · T1E02/);
  await page.mouse.move(700, 400); await page.locator("#player-close").click();
  await page.waitForFunction(() => document.querySelector("#player-modal").hidden);

  // Filmes: só filmes.
  await page.locator("#nav-bibliotecas .nav-item", { hasText: "Filmes" }).click();
  await page.waitForFunction(() => document.querySelector(".catalogo h1")?.textContent === "Filmes");
  const filmes = await page.locator(".grade .titulo-legenda-nome").allTextContents();
  assert.ok(filmes.length >= 4 && !filmes.some((f) => /Daemons/.test(f)), `filmes: ${filmes}`);
  assert.deepEqual(erros, []);
  console.log("PQA-225 ok");
} finally {
  await navegador.close();
}
