// PQA-267: faixas embutidas do mesmo idioma aparecem com o nome da faixa ("Português · FORÇADA PT-BR · embutida"),
// não mais duas vezes "Português · SUBRIP" (filme de teste "Legendas Embutidas (2026)", igual ao Coyote vs. Acme do Zima).
// PQA-266: no player, a legenda que o Bazarr baixou aparece como "Bazarr - PT-BR" (o arquivo continua
// "<vídeo>.pt-BR.srt", único nome que o Bazarr reconhece). Chromium do sistema contra o Pugoticine em Docker com o
// Bazarr falso do compose de desenvolvimento.
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const erros = [];
try {
  const contexto = await navegador.newContext({ viewport: { width: 1600, height: 900 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-marcos", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", (e) => erros.push(String(e)));

  // A API já entrega o rótulo e a origem.
  const corpo = await (await page.request.get(`${BASE}/api/bootstrap`)).json();
  const lista = corpo.media ?? corpo.catalog ?? corpo.items ?? [];
  const chefao = lista.find((m) => /Godfather|Poderoso/.test(m.title));
  assert.ok(chefao, "filme de teste no catálogo");
  assert.deepEqual(chefao.subtitles.map((s) => [s.label, s.origem]), [["Bazarr - PT-BR", "bazarr"]]);

  await page.goto(BASE);
  await page.locator("[data-play]", { hasText: /The Godfather|O Poderoso Chefão/ }).first().click();
  await page.waitForFunction(() => { const v = document.querySelector("#player"); return v.currentTime > 0.3 && !v.paused; }, null, { timeout: 60000 });
  await page.locator("#osd-legendas").click();
  const item = page.locator(".osd-menu-item", { hasText: "Bazarr - PT-BR" });
  await item.waitFor();
  if (fotos) await page.screenshot({ path: path.join(fotos, "legendas-bazarr.png") });
  await item.click();
  await page.waitForFunction(() => [...document.querySelector("#player").textTracks].some((t) => t.mode === "showing"));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("#player-modal").hidden);

  await page.locator("[data-play]", { hasText: "Legendas Embutidas" }).first().click();
  await page.waitForFunction(() => { const v = document.querySelector("#player"); return v.currentTime > 0.3 && !v.paused; }, null, { timeout: 60000 });
  await page.locator("#osd-legendas").click();
  await page.locator(".osd-menu-item", { hasText: "FORÇADA PT-BR" }).waitFor();
  const itens = (await page.locator(".osd-menu-item").allInnerTexts()).map((t) => t.replace(/^✓\s*/, "").trim()).filter((t) => t && !/^Legendas$/.test(t));
  assert.ok(itens.includes("Português · FORÇADA PT-BR · embutida"), itens.join(" | "));
  assert.ok(itens.includes("Português · PT-BR · embutida"), itens.join(" | "));
  assert.ok(!itens.some((t) => /SUBRIP/.test(t)), "sem o nome do formato no lugar do nome da faixa");
  if (fotos) await page.screenshot({ path: path.join(fotos, "legendas-embutidas.png") });
  await page.locator(".osd-menu-item", { hasText: "Português · PT-BR · embutida" }).click();
  await page.waitForFunction(() => [...document.querySelector("#player").textTracks].some((t) => t.mode === "showing" && t.label === "Português · PT-BR · embutida"), null, { timeout: 30000 });
  assert.deepEqual(erros, []);
  console.log("PQA-266/267 ok");
} finally {
  await navegador.close();
}
