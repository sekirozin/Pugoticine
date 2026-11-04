// PQA-221: player em tela cheia no estilo do Jellyfin (controllers/playback/video), no Chromium do sistema contra o
// PugotiCine em Docker: ocupa a tela inteira com "Título (Ano)"; controles somem após 3 s tocando e voltam ao mexer o
// mouse; play/pausa (botão, espaço, K), voltar 10 s / avançar 30 s (J/L e setas), volume e mudo (M), barra de
// progresso, "Termina às", menus de legendas, áudio e configurações (velocidade, proporção, informações); trocar
// legenda de texto não recarrega o vídeo; Esc fecha.
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
  let pedidosDeReproducao = 0;
  page.on("request", (r) => { if (r.url().endsWith("/playback")) pedidosDeReproducao++; });
  const video = () => page.evaluate(() => { const v = document.querySelector("#player"); return { t: v.currentTime, pausado: v.paused, vol: v.volume, mudo: v.muted, taxa: v.playbackRate, ajuste: v.style.objectFit }; });
  const tocando = () => page.waitForFunction(() => { const v = document.querySelector("#player"); return v.currentTime > 0.3 && !v.paused; }, null, { timeout: 60000 });

  await page.goto(BASE);
  await page.locator("[data-play]", { hasText: "Teste Longo" }).first().click();
  await tocando();
  // Tela cheia de verdade e título com o ano.
  const janela = await page.locator("#player-modal").boundingBox();
  assert.deepEqual([janela.x, janela.y, janela.width, janela.height], [0, 0, 1600, 900]);
  const tela = await page.locator("#player").boundingBox();
  assert.ok(tela.width === 1600 && tela.height === 900, "vídeo ocupa a tela");
  assert.equal(await page.locator("#player-title").textContent(), "Teste Longo (2026)");
  assert.match(await page.locator("#osd-termina").textContent(), /^Termina às \d{2}:\d{2}$/);
  if (fotos) await page.screenshot({ path: path.join(fotos, "osd.png") });

  // Controles somem tocando e voltam com o mouse.
  await page.mouse.move(800, 450);
  await page.waitForFunction(() => document.querySelector("#player-modal").classList.contains("osd-oculto"), null, { timeout: 6000 });
  await page.mouse.move(820, 460);
  await page.waitForFunction(() => !document.querySelector("#player-modal").classList.contains("osd-oculto"));

  // Play/pausa: botão, espaço, K.
  await page.locator("#osd-play").click();
  assert.equal((await video()).pausado, true);
  assert.equal(await page.locator("#osd-play").getAttribute("aria-label"), "Reproduzir");
  await page.keyboard.press("Space");
  assert.equal((await video()).pausado, false);
  await page.keyboard.press("k");
  assert.equal((await video()).pausado, true);

  // Pulos de 30 s / 10 s (L, J) e pelos botões.
  let antes = (await video()).t;
  await page.keyboard.press("l");
  await page.waitForFunction((a) => Math.abs(document.querySelector("#player").currentTime - (a + 30)) < 0.6, antes);
  antes = (await video()).t;
  await page.locator("#osd-voltar").click();
  await page.waitForFunction((a) => Math.abs(document.querySelector("#player").currentTime - (a - 10)) < 0.6, antes);

  // Barra de progresso: pular para 4:00.
  await page.locator("#osd-posicao").evaluate((barra) => { barra.value = "240"; barra.dispatchEvent(new Event("input")); barra.dispatchEvent(new Event("change")); });
  await page.waitForFunction(() => Math.abs(document.querySelector("#player").currentTime - 240) < 0.6);
  assert.equal(await page.locator("#osd-atual").textContent(), "4:00");

  // Volume e mudo.
  await page.locator("#osd-volume").evaluate((barra) => { barra.value = "40"; barra.dispatchEvent(new Event("input")); });
  assert.equal((await video()).vol, 0.4);
  await page.keyboard.press("m");
  assert.equal((await video()).mudo, true);
  await page.keyboard.press("m");

  // Menus: áudio, legendas, configurações (velocidade, proporção, informações).
  await page.locator("#osd-audio").click();
  assert.match(await page.locator("#osd-menu").innerText(), /Áudio[\s\S]*AC3 · 6 canais/);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#osd-menu").isHidden(), true, "Esc fecha o menu sem fechar o player");
  assert.equal(await page.locator("#player-modal").isVisible(), true);
  await page.locator("#osd-legendas").click();
  assert.match(await page.locator("#osd-menu").innerText(), /Desativada/);
  await page.locator("#osd-config").click();
  await page.locator(".osd-menu-item", { hasText: "Velocidade" }).click();
  await page.locator(".osd-menu-item", { hasText: "1.5x" }).click();
  assert.equal((await video()).taxa, 1.5);
  await page.locator("#osd-config").click();
  await page.locator(".osd-menu-item", { hasText: "Proporção" }).click();
  await page.locator(".osd-menu-item", { hasText: "Cortar" }).click();
  assert.equal((await video()).ajuste, "cover");
  await page.locator("#osd-config").click();
  await page.locator(".osd-menu-item", { hasText: "Informações de reprodução" }).click();
  assert.match(await page.locator("#osd-info").innerText(), /Modo[\s\S]*Remux[\s\S]*Vídeo[\s\S]*H264 1920×1080[\s\S]*AC3 6 canais → AAC estéreo/);
  if (fotos) await page.screenshot({ path: path.join(fotos, "osd-info.png") });

  // Esc fecha o player.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("#player-modal").hidden);

  // Legenda de texto (externa .pt-BR.srt) entra sem recarregar o vídeo.
  await page.locator("[data-play]", { hasText: /The Godfather|O Poderoso Chefão/ }).first().click();
  await tocando();
  const pedidos = pedidosDeReproducao;
  await page.locator("#osd-legendas").click();
  await page.locator(".osd-menu-item", { hasText: "externa" }).click();
  await page.waitForFunction(() => [...document.querySelector("#player").textTracks].some((t) => t.mode === "showing"));
  assert.equal(pedidosDeReproducao, pedidos, "trocar legenda de texto não pediu nova reprodução");
  await page.locator("#osd-legendas").click();
  await page.locator(".osd-menu-item", { hasText: "Desativada" }).click();
  await page.waitForFunction(() => ![...document.querySelector("#player").textTracks].some((t) => t.mode === "showing"));
  assert.equal(pedidosDeReproducao, pedidos);
  assert.deepEqual(erros, []);
  console.log("PQA-221 ok");
} finally {
  await navegador.close();
}
