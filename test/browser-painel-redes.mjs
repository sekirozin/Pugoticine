// PQA-242: Painel › Redes com efeito no navegador (Chromium do sistema) contra a cópia isolada (127.0.0.1:3022):
// salvar uma configuração que bloquearia o próprio administrador é recusado; com proxy conhecido e conexões
// remotas desligadas, um cliente "remoto" (X-Forwarded-For) recebe 403 e a rede local continua entrando; o
// filtro em lista negra bloqueia só o IP listado; voltar ao padrão libera.
import assert from "node:assert/strict";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3022";
const ADMIN = { cookie: "pugotilab_session=dev-sekiro", "content-type": "application/json" };
const api = async (metodo, rota, corpo) => { const r = await fetch(BASE + rota, { method: metodo, headers: ADMIN, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, corpo: await r.json().catch(() => null) }; };
const de = async (ip, rota = "/api/bootstrap") => (await fetch(BASE + rota, { headers: { ...ADMIN, "x-forwarded-for": ip } })).status;
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
const padrao = (await api("GET", "/api/painel/config/redes")).corpo.valores;
const PROXIES = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", e => erros.push(String(e)));
  await page.goto(BASE); await page.waitForSelector(".titulo");
  await page.evaluate(() => document.querySelector("#painel-button").click());
  await page.locator('[data-painel-ir="redes"]').click();
  await page.waitForSelector('[data-painel-form="redes"]');
  assert.match(await page.locator("[data-painel-conteudo]").innerText(), /Têm efeito de verdade/);

  // 1) Redes LAN que não incluem o navegador + remoto desligado → bloquearia o administrador: recusado.
  await page.locator('[name="LocalNetworkSubnets"]').fill("203.0.113.0/24");
  await page.locator('[name="EnableRemoteAccess"]').uncheck();
  await page.locator('[data-painel-form="redes"] button[type="submit"]').click();
  await page.waitForFunction(() => /bloquearia o seu próprio acesso/.test(document.querySelector("[data-painel-status]")?.textContent ?? ""));
  assert.deepEqual((await api("GET", "/api/painel/config/redes")).corpo.valores.LocalNetworkSubnets, padrao.LocalNetworkSubnets, "nada salvo");

  // 2) Proxy conhecido (a rede do Docker) + remoto desligado, pela tela.
  await page.locator('[name="LocalNetworkSubnets"]').fill("");
  await page.locator('[name="KnownProxies"]').fill(PROXIES.join("\n"));
  await page.locator('[data-painel-form="redes"] button[type="submit"]').click();
  await page.waitForFunction(() => /Configurações salvas/.test(document.querySelector("[data-painel-status]")?.textContent ?? ""));
  assert.equal(await de("8.8.8.8"), 403, "remoto recusado");
  assert.equal(await de("8.8.8.8", "/"), 403, "até a página");
  const texto = await (await fetch(BASE + "/", { headers: { "x-forwarded-for": "8.8.8.8" } })).text();
  assert.match(texto, /conexões remotas desativadas/);
  assert.equal(await de("192.168.1.6"), 200, "rede local entra");
  assert.equal(await de("100.100.1.1"), 200, "Tailscale entra");
  assert.equal((await fetch(BASE + "/health", { headers: { "x-forwarded-for": "8.8.8.8" } })).status, 200, "health sempre responde");
  await page.reload(); await page.waitForSelector(".titulo"); // o navegador (rede do Docker) continua entrando

  // 3) Remoto ligado com lista negra.
  assert.equal((await api("PUT", "/api/painel/config/redes", { EnableRemoteAccess: true, RemoteIPFilter: "203.0.113.0/24", IsRemoteIPFilterBlacklist: "true", KnownProxies: PROXIES.join("\n") })).status, 200);
  assert.equal(await de("203.0.113.9"), 403);
  assert.equal(await de("8.8.8.8"), 200);
  // 4) Lista branca.
  await api("PUT", "/api/painel/config/redes", { IsRemoteIPFilterBlacklist: "false" });
  assert.equal(await de("203.0.113.9"), 200);
  assert.equal(await de("8.8.8.8"), 403);
  // 5) Sem proxy conhecido o cabeçalho é ignorado (não dá para se passar por outro IP).
  await api("PUT", "/api/painel/config/redes", { KnownProxies: "", EnableRemoteAccess: false });
  assert.equal(await de("8.8.8.8"), 200);
  assert.deepEqual(erros, []);
  console.log("PQA-242 ok");
} finally {
  await api("PUT", "/api/painel/config/redes", { ...padrao, LocalNetworkSubnets: padrao.LocalNetworkSubnets.join("\n"), KnownProxies: padrao.KnownProxies.join("\n"), RemoteIPFilter: padrao.RemoteIPFilter.join("\n"), LocalNetworkAddresses: padrao.LocalNetworkAddresses.join("\n"), PublishedServerUriBySubnet: padrao.PublishedServerUriBySubnet.join("\n") });
  await navegador.close();
}
