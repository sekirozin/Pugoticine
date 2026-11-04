// PQA-280: menu da conta igual em todos os serviços (<pugoti-conta>, public/pugoti-conta.js), no Pugoticine.
//  - foto, nome e @usuário vindos do auth (/auth/api/session, aqui respondido pelo Playwright);
//  - Perfil → Pugoti Profile com volta; atalhos para os serviços (o atual destacado); Sair → logout do auth;
//  - tema da conta (Claro) aplicado ao abrir; trocar para Escuro aplica na hora e salva em /auth/api/preferences;
//  - versão clara da paleta Lima: fundo claro, texto escuro, botões Lima; o player continua escuro.
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-marcos", url: BASE }]);
  let salvo = null;
  await contexto.route("https://pugotilab.com/auth/api/session", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": BASE, "access-control-allow-credentials": "true" },
    body: JSON.stringify({ authenticated: true, profile: { id: "u1", username: "marcos", displayName: "Marcos", nickname: "Marquinhos", avatarUrl: "", role: "user", preferences: { theme: "claro", subtitleLanguage: "pt-BR", audioLanguage: "padrao" } } }) }));
  await contexto.route("https://pugotilab.com/auth/api/preferences", (r) => {
    const cabecalhos = { "access-control-allow-origin": BASE, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, PATCH", "access-control-allow-headers": "Content-Type" };
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cabecalhos });
    salvo = JSON.parse(r.request().postData());
    return r.fulfill({ status: 200, contentType: "application/json", headers: cabecalhos, body: JSON.stringify({ preferences: salvo.preferences }) });
  });
  const page = await contexto.newPage();
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto(BASE);
  await page.waitForSelector(".titulo");
  await page.waitForFunction(() => document.documentElement.dataset.pugotiTema === "claro");
  const claro = await page.evaluate(() => ({ fundo: getComputedStyle(document.body).backgroundColor, texto: getComputedStyle(document.body).color, primaria: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() }));
  assert.deepEqual(claro, { fundo: "rgb(244, 245, 239)", texto: "rgb(20, 20, 20)", primaria: "#c8ff00" }, "paleta Lima clara");
  if (fotos) await page.screenshot({ path: path.join(fotos, "conta-claro.png") });

  await page.locator("pugoti-conta .pc-gatilho").click();
  const menu = page.locator("pugoti-conta .pc-menu");
  await menu.waitFor();
  assert.match(await menu.locator(".pc-resumo").innerText(), /Marquinhos[\s\S]*@marcos/);
  assert.match(await menu.locator('a:has-text("Perfil")').getAttribute("href"), /^https:\/\/pugotilab\.com\/auth\/profile\?return=/);
  assert.match(await menu.locator('a:has-text("Sair")').getAttribute("href"), /^https:\/\/pugotilab\.com\/auth\/logout\?return=/);
  const apps = await menu.locator(".pc-app > span:last-child").allInnerTexts();
  assert.deepEqual(apps.map((t) => t.trim()), ["cine", "read", "tasks", "money", "list", "dice", "Portal"].map((t) => t === "Portal" ? "Portal" : t.charAt(0).toUpperCase() + t.slice(1)), apps.join("|"));
  assert.equal(await menu.locator('.pc-app[aria-current="true"] > span:last-child').innerText(), "Cine");
  assert.equal(await menu.locator('[data-tema="claro"]').getAttribute("aria-pressed"), "true");
  if (fotos) await page.screenshot({ path: path.join(fotos, "conta-menu.png") });

  await menu.locator('[data-tema="escuro"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.pugotiTema === "escuro");
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(16, 16, 16)");
  await page.waitForFunction(() => true);
  for (let i = 0; i < 20 && !salvo; i++) await page.waitForTimeout(100);
  assert.deepEqual(salvo, { preferences: { theme: "escuro" } }, "tema salvo na conta");
  await page.keyboard.press("Escape");
  assert.equal(await menu.isHidden(), true, "Esc fecha o menu");
  assert.deepEqual(erros, []);
  console.log("PQA-280 (Pugoticine) ok");
} finally {
  await navegador.close();
}
