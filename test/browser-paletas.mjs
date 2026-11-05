// PQA-283 (atualizado pelo PQA-286): Temas Pugotilab no Pugoticine com o menu da conta servido pelo próprio app.
// A engrenagem abre Configurações › Aparência com os 7 temas nomeados (Lima, Laranja, Brasa, Neon, Volt, Selva, Ouro);
// Laranja continua valendo (#d97706); a escolha salva na conta (PATCH /auth/api/preferences {palette}) e volta ao
// recarregar.
// Rodar: PUGOTICINE_URL=http://127.0.0.1:3017 node test/browser-paletas.mjs
import assert from "node:assert/strict";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const base = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const browser = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
try {
  const context = await browser.newContext();
  await context.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: base }]);
  let palette = "lima";
  const cors = { "access-control-allow-origin": base, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, PATCH", "access-control-allow-headers": "Content-Type" };
  await context.route("https://pugotilab.com/auth/api/session", (r) => r.fulfill({ json: { profile: { username: "sekiro", displayName: "Sekiro", role: "admin", preferences: { theme: "escuro", palette } } }, headers: cors }));
  await context.route("https://pugotilab.com/auth/api/preferences", async (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    palette = r.request().postDataJSON().preferences.palette;
    await r.fulfill({ json: { preferences: { palette } }, headers: cors });
  });
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(base);
  await p.waitForSelector("pugoti-conta .pc-engrenagem");
  await p.locator("pugoti-conta .pc-engrenagem").click();
  const nomes = (await p.locator(".pc-janela .pc-tema-cartao strong").allTextContents()).map((t) => t.trim());
  assert.deepEqual(nomes, ["Lima", "Laranja", "Brasa", "Neon", "Volt", "Selva", "Ouro"]);
  await p.locator('.pc-janela [data-pc-tema="laranja"]').click();
  await p.waitForFunction(() => document.documentElement.dataset.pugotiPaleta === "laranja");
  assert.equal(palette, "laranja");
  assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()), "#d97706");
  await p.reload();
  await p.waitForFunction(() => document.documentElement.dataset.pugotiPaleta === "laranja");
  assert.deepEqual(errors, []);
  console.log("PQA-283/286 (Pugoticine): 7 temas, Laranja aplicado, salvo e persistente OK");
} finally {
  await browser.close();
}
