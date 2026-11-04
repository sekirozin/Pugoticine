// PQA-227: metadados do TMDB em português no navegador (Pugoticine em Docker com TMDB_READ_TOKEN): capas reais em vez
// de quadro do vídeo, título traduzido, sinopse, série com sinopse/ano e episódios com nome, sinopse e cena.
// PQA-228: a foto do avatar cobre o círculo inteiro (não fica cortada pela metade).
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
try {
  const contexto = await navegador.newContext({ viewport: { width: 1600, height: 900 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", (e) => erros.push(String(e)));
  const dados = await (await page.request.get(`${BASE}/api/bootstrap`)).json();
  const godfather = dados.media.find((m) => m.metadata?.originalTitle === "The Godfather");
  assert.ok(godfather, "TMDB ativo: suba o container com TMDB_READ_TOKEN (mesma chave do Pugotilist)");
  assert.equal(godfather.title, "O Poderoso Chefão");
  assert.ok(godfather.metadata.overview.length > 40, "sinopse");
  assert.match(godfather.metadata.posterUrl, /^https:\/\/image\.tmdb\.org\/t\/p\/w780\//);

  await page.goto(BASE);
  await page.waitForSelector(".titulo");
  await page.locator("#nav-bibliotecas .nav-item", { hasText: "Filmes" }).click();
  const cartao = page.locator(".grade .titulo", { hasText: "O Poderoso Chefão" });
  assert.equal(await cartao.locator(".titulo-legenda-ano").textContent(), "1972");
  // Capa do TMDB: a imagem pedida é a versão com a URL remota (não o quadro do vídeo).
  await cartao.locator(".titulo-img.carregada").waitFor({ timeout: 30000 });
  const tamanho = await cartao.locator(".titulo-img").evaluate((img) => [img.naturalWidth, img.naturalHeight]);
  assert.equal(tamanho[1], Math.round(tamanho[0] * 1.5), "pôster 2:3");
  await cartao.locator(".titulo-capa").click();
  await page.waitForSelector(".detalhes");
  assert.doesNotMatch(await page.locator(".detalhes-sinopse").textContent(), /Sem sinopse/);
  await page.keyboard.press("Escape");

  // Série: título traduzido, sinopse, ano e episódios em português com imagem da cena.
  await page.locator("#nav-bibliotecas .nav-item", { hasText: "Animes" }).click();
  await page.waitForFunction(() => document.querySelector(".catalogo h1")?.textContent === "Animes");
  assert.equal(await page.locator(".grade .titulo-legenda-nome").first().textContent(), "Daemons do Reino das Sombras");
  assert.equal(await page.locator(".grade .titulo-legenda-ano").first().textContent(), "2026");
  await page.locator(".grade .titulo-capa").first().click();
  await page.waitForSelector(".detalhes .episodio");
  assert.match(await page.locator(".detalhes-sinopse").textContent(), /Yuru/);
  const nomes = await page.locator(".episodio-info h4").allTextContents();
  assert.ok(nomes.every((n) => !/Episódio \d+$/.test(n)), `episódios com nome: ${nomes}`);
  assert.ok(await page.locator(".episodio-sinopse").count() >= 1);
  assert.match(await page.locator(".episodio-capa img").first().getAttribute("src"), /\/imagem\/cena\?/);
  if (fotos) await page.screenshot({ path: path.join(fotos, "metadados-serie.png") });
  await page.keyboard.press("Escape");

  // PQA-228: avatar inteiro no círculo (foto retrato, mais alta que larga).
  await page.evaluate(() => {
    const c = Object.assign(document.createElement("canvas"), { width: 60, height: 120 });
    const g = c.getContext("2d"); g.fillStyle = "#c00"; g.fillRect(0, 0, 60, 120);
    document.querySelector("#avatar").src = c.toDataURL();
  });
  await page.waitForFunction(() => document.querySelector("#avatar").complete);
  const [botao, foto] = await Promise.all([page.locator("#profile-button").boundingBox(), page.locator("#avatar").boundingBox()]);
  for (const k of ["x", "y", "width", "height"]) assert.ok(Math.abs(botao[k] - foto[k]) < 1, `avatar ${k}: ${foto[k]} ≠ ${botao[k]}`);
  assert.equal(await page.locator("#avatar-fallback").evaluate((e) => getComputedStyle(e).visibility), "hidden");
  assert.deepEqual(erros, []);
  console.log("PQA-227/228 ok");
} finally {
  await navegador.close();
}
