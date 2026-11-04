// PQA-236: Painel › Bibliotecas e Usuários com efeito real, no navegador (Chromium do sistema) contra a cópia
// isolada (127.0.0.1:3022, /media/movies + /media/teste): adicionar biblioteca de séries pelo seletor de pastas,
// episódios com nome pelas regras do Jellyfin, rastrear, editar, remover; acesso por biblioteca e classificação
// etária limitam o que o usuário vê e abre.
import assert from "node:assert/strict";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3022";
const ADMIN = { cookie: "pugotilab_session=dev-sekiro", "content-type": "application/json" };
const MARCOS = { cookie: "pugotilab_session=dev-marcos", "content-type": "application/json" };
const req = async (metodo, rota, cab = ADMIN, corpo) => { const r = await fetch(BASE + rota, { method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, corpo: await r.json().catch(() => null) }; };
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
try {
  // Limpa sobras de execuções anteriores.
  for (const b of (await req("GET", "/api/painel/bibliotecas")).corpo.bibliotecas) if (b.id !== "filmes") await req("DELETE", `/api/painel/bibliotecas/${b.id}`);
  await req("GET", "/api/bootstrap", MARCOS);
  await req("PUT", "/api/painel/usuarios/marcos", ADMIN, { todasBibliotecas: true, bibliotecas: [], classificacaoMaxima: null, bloquearSemClassificacao: false });

  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: "dev-sekiro", url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", e => erros.push(String(e)));
  page.on("dialog", d => d.accept());
  await page.goto(BASE); await page.waitForSelector(".media-card");
  await page.evaluate(() => document.querySelector("#painel-button").click());
  await page.waitForSelector("#painel-drawer");
  await page.locator('[data-painel-expandir="Bibliotecas"]').click().catch(() => {});
  await page.locator('[data-painel-ir="bibliotecas"]').click();
  await page.waitForSelector("[data-adicionar-biblioteca]");

  // Adicionar pelo formulário e pelo seletor de pastas.
  await page.locator("[data-adicionar-biblioteca]").click();
  await page.locator('[data-form-biblioteca] [name="tipo"]').selectOption("tvshows");
  await page.locator('[data-form-biblioteca] [name="nome"]').fill("Animes");
  await page.locator("[data-escolher-pasta]").click();
  await page.locator('[data-ir-pasta="/media"]').click();
  await page.locator('[data-ir-pasta="/media/teste"]').click();
  await page.locator('[data-ir-pasta="/media/teste/Animes"]').click();
  await page.locator("[data-usar-pasta]").click();
  assert.match(await page.locator("[data-lista-pastas]").innerText(), /\/media\/teste\/Animes/);
  await page.locator('[data-form-biblioteca] button[type="submit"]').click();
  await page.waitForSelector('[data-biblioteca]:has-text("Animes")');
  assert.match(await page.locator('[data-biblioteca]:has-text("Animes")').innerText(), /Séries · 3 itens/);
  const animes = (await req("GET", "/api/painel/bibliotecas")).corpo.bibliotecas.find(b => b.nome === "Animes");
  const media = (await req("GET", "/api/bootstrap")).corpo.media;
  const episodios = media.filter(m => m.bibliotecaId === animes.id).map(m => m.title).sort();
  assert.deepEqual(episodios, ["Daemons of the Shadow Realm · T1E01", "Daemons of the Shadow Realm · T1E02", "Daemons of the Shadow Realm · T1E03"]);

  // Validação aparece na tela.
  await page.locator("[data-adicionar-biblioteca]").click();
  await page.locator('[data-form-biblioteca] [name="nome"]').fill("Animes");
  await page.locator('[data-form-biblioteca] button[type="submit"]').click();
  await page.waitForFunction(() => /ao menos uma pasta|Já existe/.test(document.querySelector("[data-form-biblioteca] [data-painel-status]")?.textContent ?? ""));
  await page.locator("[data-form-biblioteca] [data-cancelar]").click();

  // Rastrear uma biblioteca e editar (renomear).
  await page.locator(`[data-rastrear-biblioteca="${animes.id}"]`).click();
  await page.waitForFunction(() => /Biblioteca rastreada/.test(document.querySelector("#toast")?.textContent ?? ""));
  await page.locator(`[data-editar-biblioteca="${animes.id}"]`).click();
  await page.locator('[data-form-biblioteca] [name="nome"]').fill("Animes da Semana");
  await page.locator('[data-form-biblioteca] button[type="submit"]').click();
  await page.waitForSelector('[data-biblioteca]:has-text("Animes da Semana")');

  // Usuário marcos: só Filmes (acesso à biblioteca) → não vê nem abre os animes.
  const anime = media.find(m => m.bibliotecaId === animes.id);
  assert.equal((await req("GET", "/api/bootstrap", MARCOS)).corpo.media.some(m => m.id === anime.id), true, "antes vê");
  await page.locator('[data-painel-ir="usuarios"]').click();
  await page.locator('[data-usuario="marcos"]').click();
  await page.locator('[data-form-usuario] [name="todasBibliotecas"]').uncheck();
  await page.locator('[data-bibliotecas-usuario] input[value="filmes"]').check();
  await page.locator('[data-form-usuario] button[type="submit"]').click();
  await page.waitForFunction(() => /Configurações salvas/.test(document.querySelector("[data-form-usuario] [data-painel-status]")?.textContent ?? ""));
  const visto = (await req("GET", "/api/bootstrap", MARCOS)).corpo.media;
  assert.ok(visto.length > 0 && visto.every(m => m.bibliotecaId === "filmes"), "só Filmes");
  assert.equal((await req("POST", `/api/media/${anime.id}/playback`, MARCOS, {})).status, 404, "não abre o anime pelo endereço");
  assert.equal((await req("GET", `/api/media/${anime.id}/stream`, MARCOS)).status, 404);
  assert.equal((await req("GET", "/api/bootstrap")).corpo.media.some(m => m.id === anime.id), true, "admin continua vendo tudo");

  // Controle dos pais: bloquear sem classificação (a mídia de teste não tem) → marcos não vê nada.
  await page.waitForTimeout(400);
  await page.locator('[data-usuario="marcos"]').click();
  await page.locator('[data-form-usuario] [name="bloquearSemClassificacao"]').check();
  await page.locator('[data-form-usuario] [name="classificacaoMaxima"]').selectOption("12");
  await page.locator('[data-form-usuario] button[type="submit"]').click();
  await page.waitForFunction(() => /Configurações salvas/.test(document.querySelector("[data-form-usuario] [data-painel-status]")?.textContent ?? ""));
  assert.equal((await req("GET", "/api/bootstrap", MARCOS)).corpo.media.length, 0, "itens sem classificação bloqueados");
  const marcos = (await req("GET", "/api/painel/usuarios")).corpo.usuarios.find(u => u.usuario === "marcos");
  assert.deepEqual([marcos.todasBibliotecas, marcos.bibliotecas, marcos.classificacaoMaxima, marcos.bloquearSemClassificacao], [false, ["filmes"], 12, true], "relido do servidor");

  // Remover a biblioteca.
  await req("PUT", "/api/painel/usuarios/marcos", ADMIN, { todasBibliotecas: true, bibliotecas: [], classificacaoMaxima: null, bloquearSemClassificacao: false });
  await page.locator('[data-painel-ir="bibliotecas"]').click();
  await page.locator(`[data-remover-biblioteca="${animes.id}"]`).click();
  await page.waitForFunction(() => !document.body.innerText.includes("Animes da Semana"));
  assert.equal((await req("GET", "/api/bootstrap")).corpo.media.some(m => m.bibliotecaId === animes.id), false);
  const atividade = (await req("GET", "/api/painel/atividade")).corpo.eventos.map(e => e.nome).join(" | ");
  assert.match(atividade, /Biblioteca Animes adicionada[\s\S]*|Biblioteca Animes da Semana removida/);
  assert.deepEqual(erros, []);
  console.log("PQA-236 ok");
} finally {
  await navegador.close();
}
