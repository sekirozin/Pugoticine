// PQA-290: Salas — escolher pessoas para convidar (amigos e busca do Pugotilab, com quem já usou o Cine), sala
// invisível e "Fechar sala" (some do sistema para todos). No Chromium contra o Pugoticine em Docker com o login de
// desenvolvimento (dev/login-dev: sekiro segue marcos e mael; lia nunca usou o Cine e só aparece pela busca).
//  - sekiro cria uma sala invisível escolhendo mael (amigo) e lia (pela busca);
//  - dentro da sala, a busca e a seleção sobrevivem às atualizações da sala (pings a cada 5 s); convida ivis;
//  - marcos (sem relação) não vê a sala na lista; entra pelo link e passa a vê-la; mael (convidado) vê;
//  - sekiro fecha a sala pelo cartão da lista: some para todos, e marcos, que estava nela, recebe o aviso.
// Rodar: PUGOTICINE_URL=http://127.0.0.1:3017 node test/browser-salas-pessoas.mjs [pasta-de-fotos]
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const fotos = process.argv[2];
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
async function pessoa(usuario) {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: `dev-${usuario}`, url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", (e) => erros.push(`${usuario}: ${e}`));
  page.on("dialog", (d) => d.accept());
  return page;
}
const nomesNaLista = (page) => page.locator(".sala-lista .sala-cartao strong").allTextContents();
try {
  // Visitas para o Painel conhecer quem já usou o Cine (ivis aparece sem ser amigo).
  for (const u of ["ivis", "marcos", "mael"]) { const p = await pessoa(u); await p.goto(BASE); await p.waitForSelector(".titulo"); await p.context().close(); }

  const sekiro = await pessoa("sekiro");
  await sekiro.goto(`${BASE}/salas`);
  await sekiro.waitForSelector("[data-sala-criar] [data-pessoas-lista] .sala-pessoa-opcao");
  const iniciais = await sekiro.locator("[data-pessoas-lista] .sala-pessoa-opcao small").allTextContents();
  assert.ok(iniciais[0].includes("amigo") && iniciais.some((t) => t.startsWith("@mael")) && iniciais.some((t) => t.startsWith("@ivis")), `amigos primeiro + quem usou o Cine: ${iniciais}`);
  assert.ok(!iniciais.some((t) => t.startsWith("@sekiro")), "não lista a própria pessoa");
  await sekiro.locator('[data-pessoa][value="mael"]').check();
  await sekiro.locator("[data-pessoas-busca]").fill("lia");
  await sekiro.waitForSelector('[data-pessoa][value="lia"]');
  await sekiro.locator('[data-pessoa][value="lia"]').check();
  assert.deepEqual((await sekiro.locator("[data-pessoas-escolhidos] .sala-chip").allTextContents()).map((t) => t.replace("×", "").trim()), ["mael", "Lia Campos"]);
  await sekiro.locator('[data-sala-criar] input[name="nome"]').fill("Sessão secreta");
  await sekiro.locator("[data-sala-invisivel]").check();
  if (fotos) await sekiro.screenshot({ path: path.join(fotos, "salas-criar.png") });
  await sekiro.locator("[data-sala-criar] button.sala-botao").click();
  await sekiro.waitForSelector("[data-sala-atual]");
  const id = await sekiro.locator("[data-sala-atual]").getAttribute("data-sala-atual");
  assert.match(new URL(sekiro.url()).pathname, new RegExp(`^/salas/${id}$`));
  assert.match(await sekiro.locator("[data-sala-convidados]").innerText(), /@mael[\s\S]*@lia/);
  assert.equal(await sekiro.locator(".sala-tipo-invisivel").count(), 1, "selo Invisível para o dono");

  // A seleção e a busca sobrevivem às atualizações da sala (pings a cada 5 s).
  await sekiro.locator("[data-sala-atual] [data-pessoas-busca]").fill("iv");
  await sekiro.waitForSelector('[data-sala-atual] [data-pessoa][value="ivis"]');
  await sekiro.locator('[data-sala-atual] [data-pessoa][value="ivis"]').check();
  await sekiro.waitForTimeout(6500);
  assert.equal(await sekiro.locator("[data-sala-atual] [data-pessoas-busca]").inputValue(), "iv", "busca mantida");
  assert.equal(await sekiro.locator('[data-sala-atual] [data-pessoa][value="ivis"]').isChecked(), true, "seleção mantida");
  assert.equal(await sekiro.locator('[data-sala-atual] [data-pessoa][value="mael"]').count(), 0, "quem já foi convidado não aparece de novo");
  await sekiro.locator("[data-sala-convidar-escolhidos]").click();
  await sekiro.waitForFunction(() => /@ivis/.test(document.querySelector("[data-sala-convidados]")?.textContent ?? ""));
  if (fotos) await sekiro.screenshot({ path: path.join(fotos, "salas-dentro.png") });

  // marcos não tem relação: não vê na lista; pelo link entra e passa a ver.
  const marcos = await pessoa("marcos");
  await marcos.goto(`${BASE}/salas`);
  await marcos.waitForSelector("[data-sala-criar]");
  assert.ok(!(await nomesNaLista(marcos)).includes("Sessão secreta"), "invisível fora da lista de quem não tem relação");
  await marcos.goto(`${BASE}/salas/${id}`);
  await marcos.waitForSelector(`[data-sala-atual="${id}"]`);
  // mael (convidado) vê na lista.
  const mael = await pessoa("mael");
  await mael.goto(`${BASE}/salas`);
  await mael.waitForSelector(".sala-lista .sala-cartao");
  assert.ok((await nomesNaLista(mael)).includes("Sessão secreta"), "convidado vê a sala invisível");
  assert.equal(await mael.locator(".sala-tipo-invisivel").count(), 0, "só o dono vê o selo");

  // sekiro sai da sala e a fecha pelo cartão da lista: some para todos; marcos (dentro) recebe o aviso.
  await sekiro.locator("[data-sala-sair]").click();
  await sekiro.waitForSelector(`.sala-cartao[data-sala-id="${id}"] [data-sala-fechar-lista]`);
  await sekiro.locator(`.sala-cartao[data-sala-id="${id}"] [data-sala-fechar-lista]`).click();
  await sekiro.waitForFunction((i) => !document.querySelector(`.sala-cartao[data-sala-id="${i}"]`), id);
  await marcos.waitForFunction(() => /encerrada/.test(document.querySelector("#toast")?.textContent ?? ""), null, { timeout: 15000 });
  await marcos.waitForSelector("[data-sala-criar]");
  await mael.reload();
  await mael.waitForSelector("[data-sala-criar]");
  assert.ok(!(await nomesNaLista(mael)).includes("Sessão secreta"), "fechada: some para todos");
  const r = await sekiro.context().request.get(`${BASE}/api/salas/${id}`);
  assert.equal(r.status(), 404, "não existe mais no servidor");
  assert.deepEqual(erros, []);
  console.log("PQA-290 ok");
} finally {
  await navegador.close();
}
