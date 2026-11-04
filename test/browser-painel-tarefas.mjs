// PQA-238: Painel › Tarefas Agendadas no navegador (Chromium do sistema) contra a cópia isolada (127.0.0.1:3022):
// as tarefas do Jellyfin existentes no Pugoticine aparecem por categoria; iniciar uma tarefa registra a execução;
// abrir a tarefa, adicionar e excluir gatilhos (diário, semanal, intervalo) persiste no servidor.
import assert from "node:assert/strict";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3022";
const ADMIN = { cookie: "pugotilab_session=dev-sekiro", "content-type": "application/json" };
const api = async (metodo, rota, corpo) => (await fetch(BASE + rota, { method: metodo, headers: ADMIN, body: corpo ? JSON.stringify(corpo) : undefined })).json();
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
try {
  await api("PUT", "/api/painel/tarefas/otimizar-banco/gatilhos", { gatilhos: [{ tipo: "intervalo", intervaloMs: 21_600_000 }] });
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", e => erros.push(String(e)));
  await page.goto(BASE); await page.waitForSelector(".titulo");
  await page.evaluate(() => document.querySelector("#painel-button").click());
  await page.waitForSelector("#painel-drawer");
  await page.locator('[data-painel-ir="tarefas"]').click();
  await page.waitForSelector('[data-tarefa="otimizar-banco"]');
  const texto = await page.locator("[data-painel-conteudo]").innerText();
  for (const t of ["Biblioteca", "Manutenção", "Escanear a Biblioteca de Mídia", "Limpar Registro de Atividades", "Limpar pasta de logs", "Limpar Arquivos Temporários", "Otimizar base de dados"]) assert.ok(texto.includes(t), t);
  assert.match(texto, /A cada 6 horas/);

  // Iniciar à mão.
  await page.locator('[data-executar="otimizar-banco"]').click();
  await page.waitForFunction(() => /Concluída · painel\.db/.test(document.querySelector('[data-tarefa="otimizar-banco"]')?.textContent ?? ""));

  // Gatilhos.
  await page.locator('[data-abrir-tarefa="otimizar-banco"]').click();
  await page.waitForSelector("[data-novo-gatilho]");
  await page.locator('[data-novo-gatilho] [name="tipo"]').selectOption("diario");
  await page.locator('[data-novo-gatilho] [name="hora"]').fill("03:30");
  await page.locator('[data-novo-gatilho] button[type="submit"]').click();
  await page.waitForSelector('[data-detalhe-tarefa] :text("Diariamente à 03:30")');
  await page.locator('[data-novo-gatilho] [name="tipo"]').selectOption("semanal");
  assert.equal(await page.locator('[data-novo-gatilho] [name="intervaloMs"]').isVisible(), false, "campo de intervalo some no semanal");
  await page.locator('[data-novo-gatilho] [name="dia"]').selectOption("6");
  await page.locator('[data-novo-gatilho] [name="hora"]').fill("04:00");
  await page.locator('[data-novo-gatilho] button[type="submit"]').click();
  await page.waitForSelector('[data-detalhe-tarefa] :text("Sábado às 04:00")');
  let t = (await api("GET", "/api/painel/tarefas/otimizar-banco")).tarefa;
  assert.deepEqual(t.gatilhosTexto, ["A cada 6 horas", "Diariamente à 03:30", "Sábado às 04:00"]);
  await page.locator('[data-remover-gatilho="0"]').click();
  await page.waitForFunction(() => !document.querySelector("[data-detalhe-tarefa]")?.textContent.includes("A cada 6 horas"));
  t = (await api("GET", "/api/painel/tarefas/otimizar-banco")).tarefa;
  assert.deepEqual(t.gatilhosTexto, ["Diariamente à 03:30", "Sábado às 04:00"]);
  assert.equal(t.resultado, "Completed");
  await page.locator("[data-voltar-tarefas]").click();
  await page.waitForSelector('[data-tarefa="varredura"]');
  const atividade = (await api("GET", "/api/painel/atividade")).eventos.map(e => e.nome).join(" | ");
  assert.match(atividade, /Otimizar base de dados concluída/);
  assert.match(atividade, /Disparadores de tarefa alterados/);
  await api("PUT", "/api/painel/tarefas/otimizar-banco/gatilhos", { gatilhos: [{ tipo: "intervalo", intervaloMs: 21_600_000 }] });
  assert.deepEqual(erros, []);
  console.log("PQA-238 ok");
} finally {
  await navegador.close();
}
