// PQA-251: salas sincronizadas no navegador real (botão "Salas de Filmes" no cabeçalho, como o SyncPlay) (Chromium do sistema) com DUAS pessoas ao mesmo tempo, contra o
// PugotiCine em Docker (dev/compose.salas.yml, porta 3032) e o filme de teste de 10 min:
//  - sekiro cria uma sala privada convidando o marcos; mael não vê a sala; senha errada é recusada;
//  - os dois entram e assistem; play, pause e pulo feitos por um aparecem no outro;
//  - posição dos dois com diferença < 1 s; uma deriva provocada (1,5 s) é corrigida sozinha.
// Uso: node test/browser-salas.mjs [pasta para capturas]
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3032";
const fotos = process.argv[2];
const api = async (quem, rota, metodo = "GET", corpo) => {
  const r = await fetch(BASE + rota, { method: metodo, headers: { cookie: `pugotilab_session=dev-${quem}`, "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, dados: await r.json().catch(() => null) };
};
const paginas = [];
// Em caso de tempo esgotado, mostra o estado de cada pessoa (vídeo, sala, versão) para diagnosticar.
const diagnostico = () => Promise.all(paginas.map(([quem, p]) => p.evaluate(() => {
  const v = document.getElementById("player"), s = window.pugoticineSalas?.sala;
  return { t: v?.currentTime, pausado: v?.paused, pronto: v?.readyState, buscando: v?.seeking, sala: s?.reproducao, abrindo: s?.abrindo, assistindo: s?.assistindo, modal: document.getElementById("player-modal")?.hidden, registro: s?.registro?.slice(-25) };
}).then(e => `${quem}: ${JSON.stringify({ ...e, registro: undefined })}\n   ${(e.registro || []).join("\n   ")}`).catch(e => `${quem}: ${e}`)));
const esperar = async (fn, ms = 20000, texto = "condição") => {
  const fim = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > fim) throw new Error(`Tempo esgotado: ${texto}\n${(await diagnostico()).join("\n")}`); await new Promise(r => setTimeout(r, 150)); }
};

const filmes = (await api("sekiro", "/api/bootstrap")).dados.media;
const teste = filmes.find(m => m.title === "Teste Longo");
assert.ok(teste, "filme de teste no catálogo");
// Regras de acesso pela API.
const privada = (await api("sekiro", "/api/salas", "POST", { nome: "Sessão do Teste", tipo: "privada", convidados: ["marcos"], mediaId: teste.id })).dados.sala;
const comSenha = (await api("sekiro", "/api/salas", "POST", { nome: "Com senha", tipo: "senha", senha: "pipoca123" })).dados.sala;
assert.ok(!(await api("mael", "/api/salas")).dados.salas.some(s => s.id === privada.id), "mael não vê a sala privada");
assert.equal((await api("mael", `/api/salas/${privada.id}`)).status, 404, "privada responde como inexistente");
assert.equal((await api("mael", `/api/salas/${comSenha.id}/entrar`, "POST", { senha: "errada" })).status, 403, "senha errada recusada");
assert.equal((await api("mael", `/api/salas/${comSenha.id}/entrar`, "POST", { senha: "pipoca123" })).status, 200, "senha certa entra");
assert.ok((await api("marcos", "/api/salas")).dados.salas.find(s => s.id === privada.id)?.convidado, "convidado vê a privada");

const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const erros = [];
async function pessoa(quem) {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: `dev-${quem}`, url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", e => erros.push(`${quem}: ${e}`));
  paginas.push([quem, page]);
  page.on("console", m => { if (m.type() === "error") console.log(`[${quem}] ${m.text().slice(0, 200)}`); });
  page.on("dialog", d => d.accept());
  await page.goto(BASE);
  await page.waitForSelector("#salas-abrir");
  // Botão no cabeçalho como o SyncPlay do Jellyfin: na barra superior, à direita da marca e à esquerda da busca e do
  // perfil; nada no menu lateral.
  const posicao = await page.evaluate(() => {
    const caixa = (s) => document.querySelector(s)?.getBoundingClientRect();
    const botao = document.getElementById("salas-abrir");
    return { naBarra: Boolean(botao.closest(".topbar")), noMenu: Boolean(document.querySelector(".sidebar #salas-abrir")), titulo: botao.title,
      botao: caixa("#salas-abrir"), marca: caixa("#brand"), busca: caixa(".topbar .search"), perfil: caixa("#profile-button") };
  });
  assert.ok(posicao.naBarra && !posicao.noMenu, "botão na barra superior, não no menu lateral");
  assert.equal(posicao.titulo, "Salas de Filmes");
  assert.ok(posicao.botao.left > posicao.marca.right && posicao.botao.right <= posicao.busca.left && posicao.busca.right <= posicao.perfil.left, `ordem: marca … Salas, busca, perfil ${JSON.stringify(posicao)}`);
  assert.ok(posicao.botao.left > 640 * 0.5, "à direita da barra");
  if (fotos && quem === "sekiro") await page.screenshot({ path: path.join(fotos, "salas-barra.png"), clip: { x: 0, y: 0, width: 1280, height: 70 } });
  await page.click("#salas-abrir");
  const cartao = page.locator(`[data-sala-id="${privada.id}"]`);
  await cartao.waitFor();
  await cartao.locator("[data-sala-entrar]").click();
  await page.waitForSelector(`[data-sala-atual="${privada.id}"]`);
  assert.ok(await page.locator("#salas-abrir.ativo").count(), "ícone aceso dentro da sala");
  await page.click("[data-sala-assistir]");
  await page.waitForFunction(() => { const v = document.getElementById("player"); return v && v.readyState >= 1; }, null, { timeout: 60000 });
  // Como uma pessoa: age depois que o player abriu e a sala aplicou a posição do grupo.
  await page.waitForFunction(() => { const s = window.pugoticineSalas?.sala; return s && !s.abrindo && s.registro.some(l => l.includes("player aberto")); }, null, { timeout: 60000 });
  return page;
}
const estado = (page) => page.evaluate(() => { const v = document.getElementById("player"); return { t: v.currentTime, pausado: v.paused, taxa: v.playbackRate }; });
const diferenca = async (a, b) => { const [x, y] = await Promise.all([estado(a), estado(b)]); return Math.abs(x.t - y.t); };

try {
  const dono = await pessoa("sekiro");
  const convidado = await pessoa("marcos");
  await esperar(async () => (await api("sekiro", `/api/salas/${privada.id}`)).dados.sala.membros.length === 2, 10000, "dois na sala");

  // Play pelo dono → os dois tocam.
  await dono.evaluate(() => document.getElementById("player").play().catch(() => {}));
  await esperar(async () => !(await estado(convidado)).pausado && (await estado(convidado)).t > 1, 30000, "convidado tocando");
  await new Promise(r => setTimeout(r, 4000));
  const d1 = await diferenca(dono, convidado);
  console.log(`tocando juntos: diferença ${(d1 * 1000).toFixed(0)} ms`);
  assert.ok(d1 < 1, `diferença < 1 s (${d1})`);
  if (fotos) await convidado.screenshot({ path: path.join(fotos, "sala-convidado.png") });

  // Pause pelo convidado → o dono pausa no mesmo ponto.
  await convidado.evaluate(() => document.getElementById("player").pause());
  await esperar(async () => (await estado(dono)).pausado, 10000, "dono pausou");
  const d2 = await diferenca(dono, convidado);
  console.log(`pausados: diferença ${(d2 * 1000).toFixed(0)} ms`);
  assert.ok(d2 < 0.5);

  // Pulo pelo convidado para 5:00 e play → os dois tocam a partir de 5:00.
  await convidado.evaluate(() => { document.getElementById("player").currentTime = 300; });
  await esperar(async () => Math.abs((await estado(dono)).t - 300) < 1, 30000, "dono foi para 5:00");
  await convidado.evaluate(() => document.getElementById("player").play().catch(() => {}));
  await esperar(async () => { const [a, b] = await Promise.all([estado(dono), estado(convidado)]); return !a.pausado && !b.pausado && a.t > 300.5 && b.t > 300.5; }, 30000, "tocando em 5:00");
  await new Promise(r => setTimeout(r, 3000));
  const d3 = await diferenca(dono, convidado);
  console.log(`depois do pulo: diferença ${(d3 * 1000).toFixed(0)} ms`);
  assert.ok(d3 < 1);

  // Deriva provocada no convidado (sem avisar a sala): a correção traz de volta.
  await convidado.evaluate(() => { const s = window.pugoticineSalas.sala; const v = document.getElementById("player"); s.pular(v, v.currentTime + 1.5); });
  await new Promise(r => setTimeout(r, 500));
  const desviada = await diferenca(dono, convidado);
  await esperar(async () => (await diferenca(dono, convidado)) < 0.3, 15000, "deriva corrigida");
  const final = await diferenca(dono, convidado);
  console.log(`deriva provocada ${(desviada * 1000).toFixed(0)} ms → corrigida para ${(final * 1000).toFixed(0)} ms`);
  if (fotos) await dono.screenshot({ path: path.join(fotos, "sala-dono.png") });
  assert.deepEqual(erros, []);
  console.log("PQA-251 ok");
} finally {
  await navegador.close();
  await api("sekiro", `/api/salas/${privada.id}`, "DELETE");
  await api("sekiro", `/api/salas/${comSenha.id}`, "DELETE");
}
