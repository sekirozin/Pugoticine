// PQA-284: com o serviço de contas fora do ar no meio do filme, o player continua tocando e a página não recarrega
// (antes: a checagem de sessão falhava, virava 401, o app mandava ao login e voltava em "Carregando sua biblioteca...").
// Rodar: PUGOTICINE_URL=http://127.0.0.1:3017 node test/browser-sessao-instavel.mjs  (para/religa o login-dev do compose)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const LOGIN = process.env.LOGIN_CONTAINER ?? "pugoticine-login-dev-1";
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const erros = [];
try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const midias = (await (await contexto.request.get(`${BASE}/api/bootstrap`)).json()).media;
  const filme = midias.find((m) => m.title === "Teste Longo") ?? midias.find((m) => !m.serie);
  const page = await contexto.newPage();
  page.on("pageerror", (e) => erros.push(String(e)));
  let recarregou = 0;
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) recarregou++; });
  await page.goto(`${BASE}/assistir/${filme.id}`);
  await page.waitForFunction(() => { const v = document.querySelector("#player"); return v && v.currentTime > 1 && !v.paused; }, null, { timeout: 60000 });
  const navegacoesAntes = recarregou;
  execFileSync("docker", ["stop", "-t", "1", LOGIN]);
  try {
    const t0 = await page.evaluate(() => document.querySelector("#player").currentTime);
    // 20 s: passa pelo salvamento de progresso (a cada 15 s) e por vários trechos de vídeo com o auth fora.
    await page.waitForTimeout(20000);
    const t1 = await page.evaluate(() => document.querySelector("#player").currentTime);
    assert.equal(recarregou, navegacoesAntes, "a página não recarregou nem foi ao login");
    assert.equal(new URL(page.url()).pathname, `/assistir/${filme.id}`);
    assert.equal(await page.evaluate(() => document.querySelector("#player-modal").hidden), false, "player continua aberto");
    assert.ok(t1 - t0 > 10, `continuou tocando com o auth fora (${t0.toFixed(1)} → ${t1.toFixed(1)} s)`);
  } finally {
    execFileSync("docker", ["start", LOGIN]);
  }
  assert.deepEqual(erros, []);
  console.log("PQA-284 ok");
} finally {
  await navegador.close();
}
