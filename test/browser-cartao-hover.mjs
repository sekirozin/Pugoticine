// PQA-287: ao passar o mouse no cartão, o botão de play (e o de informações) aparece sobre a base da capa e nunca é
// cortado nem cobre a legenda — em todos os instantes da animação de zoom (60, 200, 400 e 700 ms), em cartões de pôster
// e largos, nas fileiras do Início e na grade da biblioteca. Antes o painel ficava preso à base do cartão inteiro
// (incluindo a legenda): o play caía por cima do nome/ano e era cortado na borda da fileira.
// Rodar: PUGOTICINE_URL=http://127.0.0.1:3017 node test/browser-cartao-hover.mjs [pasta-de-fotos]
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });

/** Medidas no instante: play/info dentro da capa e de todo ancestral que corta; painel acima da legenda. */
function medir(cartao) {
  const r = (el) => el.getBoundingClientRect();
  const capa = r(cartao.querySelector(".titulo-capa")), legenda = r(cartao.querySelector(".titulo-legenda"));
  const painel = cartao.querySelector(".titulo-painel");
  const problemas = [];
  for (const botao of cartao.querySelectorAll(".titulo-play, .titulo-info")) {
    const b = r(botao), nome = botao.className;
    if (b.left < capa.left - 0.5 || b.right > capa.right + 0.5 || b.top < capa.top - 0.5 || b.bottom > capa.bottom + 0.5) problemas.push(`${nome} fora da capa`);
    if (b.top >= legenda.top - 0.5 && b.bottom > legenda.top + 0.5 && legenda.height) problemas.push(`${nome} sobre a legenda`);
    for (let a = cartao.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      // Recorta: overflow diferente de visible, ou contenção de pintura (content-visibility:auto, contain: paint/content/strict).
      const contem = cs.contentVisibility === "auto" || /paint|content|strict/.test(cs.contain);
      if (cs.overflowX === "visible" && cs.overflowY === "visible" && !contem) continue;
      const c = r(a);
      if (b.left < c.left - 0.5 || b.right > c.right + 0.5 || b.top < c.top - 0.5 || b.bottom > c.bottom + 0.5) problemas.push(`${nome} cortado por ${a.className || a.tagName}`);
    }
    if (b.top < 0 || b.bottom > innerHeight) problemas.push(`${nome} fora da janela`);
    // Nada por cima: nos cantos e no centro, o elemento de cima é o próprio botão.
    for (const [x, y] of [[b.left + 3, b.top + b.height / 2], [b.right - 3, b.top + b.height / 2], [b.left + b.width / 2, b.top + 3], [b.left + b.width / 2, b.bottom - 3], [b.left + b.width / 2, b.top + b.height / 2]]) {
      const topo = document.elementFromPoint(x, y);
      if (!topo || !botao.contains(topo)) { problemas.push(`${nome} encoberto em (${Math.round(x)},${Math.round(y)}) por ${topo?.id || topo?.className || topo?.tagName}`); break; }
    }
  }
  if (r(painel).bottom > capa.bottom + 0.5) problemas.push("painel abaixo da capa (sobre a legenda)");
  return { problemas, opacidade: Number(getComputedStyle(painel).opacity) };
}

try {
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  // Um título em andamento: aparece em "Continuar assistindo" (cartão largo, com barra de progresso).
  const midias = (await (await contexto.request.get(`${BASE}/api/bootstrap`)).json()).media;
  const filme = midias.find((m) => !m.serie);
  await contexto.request.post(`${BASE}/api/progress`, { data: { mediaId: filme.id, position: 120, duration: 600 } });
  const page = await contexto.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  const casos = [];
  for (const [rota, seletor] of [["/", ".fileira .titulo-poster"], ["/", ".fileira .titulo-largo"], ["/biblioteca/filmes", ".grade .titulo"]]) {
    await page.goto(BASE + rota);
    await page.waitForSelector(".titulo");
    await page.waitForTimeout(800);
    const total = await page.locator(seletor).count();
    if (!total) continue;
    // Primeiro, um do meio e o último da fileira (as pontas mudam a origem do zoom).
    for (const i of [...new Set([0, Math.floor(total / 2), total - 1])]) {
      const cartao = page.locator(seletor).nth(i);
      await page.mouse.move(5, 5);
      await cartao.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
      await page.waitForTimeout(450);
      const caixa = await cartao.locator(".titulo-capa").boundingBox();
      await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 3);
      let anterior = 0;
      for (const t of [60, 200, 400, 700]) {
        await page.waitForTimeout(t - anterior); anterior = t;
        const { problemas, opacidade } = await cartao.evaluate(medir);
        casos.push(`${rota} ${seletor} #${i} ${t}ms`);
        // Enquanto o painel aparece (opacidade > 0), os botões já precisam estar inteiros e no lugar.
        if (opacidade > 0) assert.deepEqual(problemas, [], `${rota} ${seletor} #${i} aos ${t} ms`);
        if (t === 700) assert.equal(opacidade, 1, "painel visível ao fim da animação");
      }
      if (fotos && i === 0) await page.screenshot({ path: path.join(fotos, `cartao-${seletor.replace(/\W+/g, "-")}.png`), clip: { x: Math.max(0, caixa.x - 60), y: Math.max(0, caixa.y - 40), width: caixa.width + 120, height: caixa.height + 140 } });
    }
  }
  assert.ok(casos.some((c) => c.includes("titulo-largo")), "cartões largos medidos");
  assert.ok(casos.length >= 28, `casos medidos: ${casos.length}`);
  assert.deepEqual(erros, []);
  console.log(`PQA-287 ok (${casos.length} medições)`);
} finally {
  await navegador.close();
}
