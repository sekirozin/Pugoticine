// PQA-289: trocar o áudio (inglês ↔ português) no player é rápido e sem tropeços: volta a tocar no mesmo ponto
// (inclusive nos primeiros 10 s, que antes voltavam ao início), com a faixa pedida, sem erro HLS de sessão apagada e
// sem cair no "modo universal" (conversão completa). MKV (AAC + AC-3) e MP4 (dois AAC, sai da reprodução direta).
// Mídia: pasta com "Dois Audios (2024).mkv" e "Dois Audios Mp4 (2024).mp4" (5 min, áudio eng/por).
// Rodar: PUGOTICINE_URL=http://127.0.0.1:3019 node test/browser-troca-audio.mjs
import assert from "node:assert/strict";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3019";
const LIMITE_MS = Number(process.env.LIMITE_TROCA_MS ?? 4000);
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const resultados = [];
try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 720 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  // Latência de rede simulada (LATENCIA_MS por pedido), como pelo túnel até o Zima.
  const latencia = Number(process.env.LATENCIA_MS ?? 0);
  if (latencia) await contexto.route(`${BASE}/**`, async (rota) => { await new Promise((r) => setTimeout(r, latencia)); await rota.continue(); });
  const midias = (await (await contexto.request.get(`${BASE}/api/bootstrap`)).json()).media;
  for (const titulo of ["Dois Audios", "Dois Audios Mp4"]) {
    const media = midias.find((m) => m.title === titulo);
    assert.ok(media, `mídia de teste "${titulo}"`);
    // Começa do início (sem progresso salvo de outra execução).
    await contexto.request.post(`${BASE}/api/progress`, { data: { mediaId: media.id, position: 0, duration: 300 } });
    const page = await contexto.newPage();
    const problemas = [];
    page.on("console", (m) => { if (/HLS: .*(403|404|fatal)/.test(m.text())) problemas.push(m.text().slice(0, 120)); });
    page.on("pageerror", (e) => problemas.push(String(e).slice(0, 120)));
    const planos = [];
    page.on("response", async (r) => { if (/\/playback$/.test(r.url())) planos.push((await r.json().catch(() => ({}))).plan); });
    await page.goto(`${BASE}/assistir/${media.id}`);
    await page.waitForFunction(() => { const v = document.querySelector("#player"); return v.currentTime > 6 && !v.paused; }, null, { timeout: 60000 });
    // Registra todo aviso de status (o "modo universal" aparece ali).
    await page.evaluate(() => { window.__status = []; new MutationObserver(() => window.__status.push(document.querySelector("#player-status").textContent)).observe(document.querySelector("#player-status"), { childList: true, characterData: true, subtree: true }); });
    const opcoes = await page.locator("#player-audio option").evaluateAll((os) => os.map((o) => [o.value, o.textContent]));
    const por = opcoes.find(([, t]) => /Portugu/.test(t)), eng = opcoes.find(([, t]) => /Ingl/.test(t));
    assert.ok(por && eng, `faixas no menu: ${JSON.stringify(opcoes)}`);
    for (const [valor, rotulo, esperar] of [[por[0], "português", 0], [eng[0], "inglês", 25]]) {
      if (esperar) await page.waitForFunction((t) => document.querySelector("#player").currentTime > t, esperar, { timeout: 60000 });
      const antes = await page.evaluate(() => document.querySelector("#player").currentTime);
      const pedidos = planos.length;
      const inicio = Date.now();
      // Como o menu "Áudio" do player faz: muda o seletor escondido e dispara change.
      await page.evaluate((v) => { const s = document.querySelector("#player-audio"); s.value = v; s.dispatchEvent(new Event("change")); }, valor);
      // Durante a troca, o último quadro fica na tela (não tela preta).
      assert.match(await page.evaluate(() => document.querySelector("#player").getAttribute("poster") ?? ""), /^data:image\/jpeg/, "quadro congelado durante a troca");
      // Só conta depois do novo pedido de reprodução (antes disso o vídeo antigo ainda pode estar tocando).
      while (planos.length === pedidos && Date.now() - inicio < 60000) await page.waitForTimeout(20);
      // Voltou a tocar perto de onde estava e avançando.
      await page.waitForFunction((t) => { const v = document.querySelector("#player"); return !v.paused && v.readyState >= 3 && v.currentTime > t - 1 && v.currentTime < t + 6; }, antes, { timeout: 60000 });
      const t1 = await page.evaluate(() => document.querySelector("#player").currentTime);
      await page.waitForTimeout(600);
      const t2 = await page.evaluate(() => document.querySelector("#player").currentTime);
      const ms = Date.now() - inicio;
      resultados.push(`${titulo} → ${rotulo}: ${ms} ms, de ${antes.toFixed(1)} s para ${t1.toFixed(1)} s`);
      assert.ok(t2 > t1, `${titulo}: continua tocando depois da troca`);
      assert.ok(Math.abs(t1 - antes) < 2.5, `${titulo}: mesma posição (${antes.toFixed(1)} → ${t1.toFixed(1)})`);
      assert.equal(planos.at(-1)?.audioStreamIndex, Number(valor), `${titulo}: faixa ${rotulo} aplicada`);
      assert.ok(ms <= LIMITE_MS, `${titulo} → ${rotulo}: troca levou ${ms} ms (limite ${LIMITE_MS})`);
    }
    // Pausado: troca e continua pausado no mesmo ponto.
    await page.evaluate(() => document.querySelector("#player").pause());
    const parado = await page.evaluate(() => document.querySelector("#player").currentTime);
    const pedidos = planos.length;
    await page.evaluate((v) => { const s = document.querySelector("#player-audio"); s.value = v; s.dispatchEvent(new Event("change")); }, por[0]);
    while (planos.length === pedidos) await page.waitForTimeout(20);
    await page.waitForFunction(() => document.querySelector("#player").readyState >= 2, null, { timeout: 30000 });
    await page.waitForTimeout(1000);
    const depois = await page.evaluate(() => ({ t: document.querySelector("#player").currentTime, pausado: document.querySelector("#player").paused }));
    assert.equal(depois.pausado, true, `${titulo}: continua pausado depois de trocar`);
    assert.ok(Math.abs(depois.t - parado) < 2.5, `${titulo}: pausado no mesmo ponto (${parado.toFixed(1)} → ${depois.t.toFixed(1)})`);
    const status = await page.evaluate(() => window.__status);
    assert.ok(!status.some((s) => /universal|Não foi possível/.test(s)), `${titulo}: sem modo universal/erro (${status.filter(Boolean).join(" | ")})`);
    assert.deepEqual(problemas, [], `${titulo}: sem erro HLS de sessão apagada`);
    await page.close();
  }
  console.log(resultados.join("\n"));
  console.log("PQA-289 ok");
} catch (erro) {
  console.log(resultados.join("\n"));
  throw erro;
} finally {
  await navegador.close();
}
