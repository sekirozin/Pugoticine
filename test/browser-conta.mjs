// PQA-280: menu da conta igual em todos os serviços (<pugoti-conta>, public/pugoti-conta.js), no Pugoticine.
//  - foto, nome e @usuário vindos do auth (/auth/api/session, aqui respondido pelo Playwright);
//  - Perfil → Pugoti Profile com volta; atalhos para os serviços (o atual destacado); Sair → logout do auth;
//  - PQA-286 (substitui o Claro/Escuro): o Tema Pugotilab da conta (aqui Brasa) é aplicado ao abrir, mesmo com a
//    preferência antiga "claro"; "Aparência" no menu e a engrenagem abrem Configurações com os 7 temas; escolher Selva
//    aplica na hora e salva em /auth/api/preferences ({ palette }).
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
    body: JSON.stringify({ authenticated: true, profile: { id: "u1", username: "marcos", displayName: "Marcos", nickname: "Marquinhos", avatarUrl: "", role: "user", preferences: { theme: "claro", palette: "brasa", subtitleLanguage: "pt-BR", audioLanguage: "padrao" } } }) }));
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
  await page.waitForFunction(() => document.documentElement.dataset.pugotiPaleta === "brasa");
  const brasa = await page.evaluate(() => ({ modo: document.documentElement.dataset.pugotiTema, fundo: getComputedStyle(document.body).backgroundColor, texto: getComputedStyle(document.body).color, primaria: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() }));
  assert.deepEqual(brasa, { modo: "escuro", fundo: "rgb(255, 66, 42)", texto: "rgb(255, 255, 255)", primaria: "#000000" }, "Tema Brasa (sem modo claro)");
  if (fotos) await page.screenshot({ path: path.join(fotos, "conta-brasa.png") });

  await page.locator("pugoti-conta .pc-gatilho").click();
  const menu = page.locator("pugoti-conta .pc-menu");
  await menu.waitFor();
  assert.match(await menu.locator(".pc-resumo").innerText(), /Marquinhos[\s\S]*@marcos/);
  assert.match(await menu.locator('a:has-text("Perfil")').getAttribute("href"), /^https:\/\/pugotilab\.com\/auth\/profile\?return=/);
  assert.match(await menu.locator('a:has-text("Sair")').getAttribute("href"), /^https:\/\/pugotilab\.com\/auth\/logout\?return=/);
  const apps = await menu.locator(".pc-app > span:last-child").allInnerTexts();
  assert.deepEqual(apps.map((t) => t.trim()), ["cine", "read", "tasks", "money", "list", "dice", "Portal"].map((t) => t === "Portal" ? "Portal" : t.charAt(0).toUpperCase() + t.slice(1)), apps.join("|"));
  assert.equal(await menu.locator('.pc-app[aria-current="true"] > span:last-child').innerText(), "Cine");
  assert.equal(await menu.locator('[data-tema]').count(), 0, "sem Claro/Escuro");
  assert.match(await menu.locator("[data-pc-configuracoes].pc-item").innerText(), /Aparência\s*Brasa/);
  if (fotos) await page.screenshot({ path: path.join(fotos, "conta-menu.png") });
  await page.keyboard.press("Escape");
  assert.equal(await menu.isHidden(), true, "Esc fecha o menu");

  await page.locator("pugoti-conta .pc-engrenagem").click();
  const janela = page.locator(".pc-janela");
  await janela.locator(".pc-tema-cartao").first().waitFor();
  assert.equal(await janela.locator(".pc-tema-cartao").count(), 7);
  await janela.locator('[data-pc-tema="selva"]').click();
  await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === "rgb(0, 0, 0)" && document.documentElement.dataset.pugotiPaleta === "selva");
  for (let i = 0; i < 20 && !salvo; i++) await page.waitForTimeout(100);
  assert.deepEqual(salvo, { preferences: { palette: "selva" } }, "tema salvo na conta");
  await page.keyboard.press("Escape");
  assert.equal(await janela.isHidden(), true, "Esc fecha Configurações");
  assert.deepEqual(erros, []);
  console.log("PQA-280 (Pugoticine) ok");
} finally {
  await navegador.close();
}
