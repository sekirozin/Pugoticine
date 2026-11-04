// PQA-224: catálogo no estilo de streaming no Chromium do sistema, contra o PugotiCine em Docker: destaque com imagem
// e botões; fileiras; cartão abre detalhes; detalhes fecham com Esc; "Assistir" dos detalhes abre o player; Filmes
// ordena; busca filtra; desempenho (só as imagens visíveis no primeiro carregamento, WebP no tamanho pedido, cache
// imutável ao recarregar); celular sem rolagem lateral.
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const erros = [];
try {
  const contexto = await navegador.newContext({ viewport: { width: 1600, height: 900 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-mael", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", (e) => erros.push(String(e)));
  const imagens = [];
  page.on("response", async (r) => { if (r.url().includes("/imagem/")) imagens.push({ url: r.url(), status: r.status(), tipo: r.headers()["content-type"], cache: r.headers()["cache-control"], deCache: r.fromServiceWorker() || (await r.request().sizes().catch(() => ({ responseBodySize: -1 }))).responseBodySize === 0 }); });

  await page.goto(BASE);
  await page.waitForSelector(".destaque-fundo.carregada", { timeout: 30000 });
  await page.waitForTimeout(1500);
  assert.ok(await page.locator(".destaque h1").textContent());
  assert.equal(await page.locator(".destaque .botao-assistir").count(), 1);
  assert.equal(await page.locator(".destaque .botao-info").count(), 1);
  const fileiras = await page.locator(".fileira h2").allTextContents();
  assert.ok(fileiras.includes("Adicionados recentemente em Filmes"), JSON.stringify(fileiras));
  // Desempenho: só o que aparece na tela, em WebP e no tamanho padronizado.
  const totalCartoes = await page.locator(".titulo-img").count();
  const pedidas = imagens.filter((i) => i.url.includes("poster") || i.url.includes("fundo"));
  // Imagens bem abaixo da tela (mais de 2 telas) não podem ter sido baixadas (loading=lazy).
  const longe = await page.evaluate(() => [...document.querySelectorAll(".titulo-img")].filter((i) => i.getBoundingClientRect().top > innerHeight * 2).map((i) => i.currentSrc || i.src));
  const baixadasLonge = longe.filter((src) => pedidas.some((p) => p.url === src));
  assert.deepEqual(baixadasLonge, [], "imagens fora da tela não são baixadas");
  assert.ok(pedidas.length <= totalCartoes + 1, `carregou ${pedidas.length} imagens para ${totalCartoes} cartões + destaque`);
  assert.ok(pedidas.every((i) => i.status === 200 && i.tipo === "image/webp" && /immutable/.test(i.cache)), JSON.stringify(pedidas.slice(0, 2)));
  assert.ok(pedidas.every((i) => /[?&]l=(185|342|500|780|1280|1920)\b/.test(i.url)));
  console.log(`primeiro carregamento: ${pedidas.length} imagens para ${totalCartoes} cartões`);
  // Ao recarregar, imagem já baixada vem do cache do navegador (endereço versionado + immutable). O destaque é
  // sorteado de novo a cada carregamento, então só contam as imagens que já tinham vindo antes.
  const antes = new Set(await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.name.includes("/imagem/")).map((e) => e.name)));
  await page.reload(); await page.waitForSelector(".destaque-fundo.carregada"); await page.waitForTimeout(800);
  const rebaixadas = await page.evaluate((ja) => performance.getEntriesByType("resource").filter((e) => ja.includes(e.name) && e.transferSize > 0).map((e) => e.name), [...antes]);
  assert.deepEqual(rebaixadas, [], "imagem já baixada não é baixada de novo ao recarregar");

  // Detalhes: abre pelo cartão, fecha com Esc; Assistir abre o player.
  const cartao = page.locator(".fileira").filter({ hasText: "Adicionados recentemente em Filmes" }).locator(".titulo-capa").first();
  await cartao.click();
  await page.waitForSelector(".detalhes");
  assert.match(await page.locator(".detalhes h3").textContent(), /Títulos parecidos|Mais títulos/);
  if (fotos) await page.screenshot({ path: path.join(fotos, "catalogo-detalhes.png") });
  await page.keyboard.press("Escape");
  await page.waitForSelector(".detalhes", { state: "detached" });
  await page.locator(".destaque .botao-info").click();
  await page.locator(".detalhes .botao-assistir").click();
  await page.waitForFunction(() => !document.querySelector("#player-modal").hidden);
  assert.equal(await page.locator(".detalhes").count(), 0, "detalhes fecham ao abrir o player");
  await page.mouse.move(700, 400); await page.locator("#player-close").click();
  await page.waitForFunction(() => document.querySelector("#player-modal").hidden);

  // Filmes: ordenar; busca.
  await page.locator("#nav-bibliotecas .nav-item", { hasText: "Filmes" }).click();
  await page.waitForSelector(".catalogo .grade");
  await page.locator('[data-filtro="ordem"]').selectOption("ano");
  const anos = await page.locator(".grade .titulo-meta em").allTextContents();
  const lista = anos.map((t) => Number(t.slice(0, 4)) || 0);
  assert.deepEqual(lista, [...lista].sort((a, b) => b - a), `ordenado por ano: ${lista}`);
  await page.locator("#search").fill("godfather");
  await page.waitForFunction(() => /Resultados para/.test(document.querySelector(".catalogo h1")?.textContent ?? ""));
  assert.equal(await page.locator(".grade .titulo").count(), 1);
  await page.locator("#search").fill("");

  // Celular: nada mais largo que a tela.
  const celular = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await celular.addCookies([{ name: "pugotilab_session", value: "dev-mael", url: BASE }]);
  const tela = await celular.newPage();
  tela.on("pageerror", (e) => erros.push(String(e)));
  await tela.goto(BASE); await tela.waitForSelector(".destaque");
  assert.ok(await tela.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "sem rolagem lateral no celular");
  assert.deepEqual(erros, []);
  console.log("PQA-224 ok");
} finally {
  await navegador.close();
}
