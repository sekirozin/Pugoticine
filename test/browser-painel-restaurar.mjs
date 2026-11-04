// PQA-240: Painel › Backups › Restaurar de ponta a ponta no navegador (Chromium do sistema) contra a cópia isolada
// (127.0.0.1:3022): criar backup, mudar uma configuração, restaurar digitando o nome, ver o aviso "reinicie" e o
// backup de segurança, reiniciar o container e conferir que a configuração voltou e a Atividade registrou.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3022";
const ADMIN = { cookie: "pugotilab_session=dev-sekiro", "content-type": "application/json" };
const api = async (metodo, rota, corpo) => (await fetch(BASE + rota, { method: metodo, headers: ADMIN, body: corpo ? JSON.stringify(corpo) : undefined })).json();
const reiniciar = async () => {
  execFileSync("docker", ["compose", "-p", "pugoticine-painel", "-f", "dev/compose.painel.yml", "restart"], { stdio: "ignore", env: { ...process.env, PUGOTICINE_MIDIA: process.env.PUGOTICINE_MIDIA ?? "/home/sekironote/IA/Fontes/Pugoticine-midia-teste" } });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return; } catch {} await new Promise(r => setTimeout(r, 1000)); }
  throw new Error("o PugotiCine não voltou");
};
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
try {
  await api("DELETE", "/api/painel/backups/restauracao");
  const geral = (await api("GET", "/api/painel/config/geral")).valores;
  await api("PUT", "/api/painel/config/geral", { ...geral, ServerName: "Cine Antes" });
  const { backup } = await api("POST", "/api/painel/backups", {});
  await api("PUT", "/api/painel/config/geral", { ...geral, ServerName: "Cine Depois" });

  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", e => erros.push(String(e)));
  let resposta = "nome-errado";
  page.on("dialog", d => { assert.match(d.message(), /substitui TODOS os dados/); d.accept(resposta); });
  await page.goto(BASE); await page.waitForSelector(".titulo");
  await page.evaluate(() => document.querySelector("#painel-button").click());
  await page.locator('[data-painel-ir="backups"]').click();
  await page.waitForSelector(`[data-restaurar="${backup.nome}"]`);

  // Nome errado é recusado; nome certo agenda.
  await page.locator(`[data-restaurar="${backup.nome}"]`).click();
  await page.waitForFunction(() => /Confirme a restauração/.test(document.querySelector("#toast")?.textContent ?? ""));
  assert.equal(await page.locator("[data-restauracao-pendente]").count(), 0);
  resposta = backup.nome;
  await page.locator(`[data-restaurar="${backup.nome}"]`).click();
  await page.waitForSelector("[data-restauracao-pendente]");
  const aviso = await page.locator("[data-restauracao-pendente]").innerText();
  assert.match(aviso, new RegExp(backup.nome));
  assert.match(aviso, /Reinicie o container/);
  const seguranca = (await api("GET", "/api/painel/backups")).restauracaoPendente.seguranca;
  assert.notEqual(seguranca, backup.nome);
  assert.match(aviso, new RegExp(seguranca));
  assert.equal((await api("GET", "/api/marca")).nomeServidor, "Cine Depois", "nada muda antes de reiniciar");

  // Cancelar e agendar de novo pela API (o caminho da tela já foi testado), depois reiniciar.
  await page.locator("[data-cancelar-restauracao]").click();
  await page.waitForFunction(() => !document.querySelector("[data-restauracao-pendente]"));
  assert.equal((await api("GET", "/api/painel/backups")).restauracaoPendente, null);
  await api("POST", `/api/painel/backups/${backup.nome}/restaurar`, { confirmar: backup.nome });
  await reiniciar();
  assert.equal((await api("GET", "/api/marca")).nomeServidor, "Cine Antes", "configuração voltou");
  assert.equal((await api("GET", "/api/painel/backups")).restauracaoPendente, null);
  const atividade = (await api("GET", "/api/painel/atividade")).eventos.map(e => e.nome).join(" | ");
  assert.match(atividade, new RegExp(`Backup restaurado: ${backup.nome}`));
  await page.reload(); await page.waitForSelector(".titulo");
  assert.deepEqual(erros, []);
  await api("PUT", "/api/painel/config/geral", geral);
  console.log("PQA-240 ok");
} finally {
  await navegador.close();
}
