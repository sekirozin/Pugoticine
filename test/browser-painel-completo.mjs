// PQA-233: Painel completo no navegador real (Chromium do sistema), contra a cópia isolada (dev/compose.painel.yml,
// 127.0.0.1:3022): menu do Painel do Jellyfin com todas as telas (e as subpáginas de Bibliotecas e Reprodução), cada
// uma com o título e o aviso do que tem efeito; salvar e reler; efeitos reais (nome do servidor, CSS da Marca,
// porcentagem para retomar, desativar usuário, dispositivos, atividade, chaves da API, backups, registros, tarefas);
// usuário comum sem acesso. Uso: node test/browser-painel-completo.mjs [pasta para capturas]
import assert from "node:assert/strict";
import path from "node:path";
import pw from "/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3022";
const fotos = process.argv[2];
const ADMIN = { cookie: "pugotilab_session=dev-sekiro", "content-type": "application/json" };
const MARCOS = { cookie: "pugotilab_session=dev-marcos", "content-type": "application/json" };
const req = async (metodo, rota, cab = ADMIN, corpo) => { const r = await fetch(BASE + rota, { method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, corpo: await r.json().catch(() => null) }; };
const navegador = await pw.chromium.launch({ executablePath: "/usr/bin/chromium" });
const erros = [];
async function pagina(usuario) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
  await contexto.addCookies([{ name: "pugotilab_session", value: `dev-${usuario}`, url: BASE }]);
  const page = await contexto.newPage();
  page.on("pageerror", e => erros.push(`${usuario}: ${e}`));
  page.on("dialog", d => d.accept());
  await page.goto(BASE);
  await page.waitForSelector(".titulo");
  return page;
}
const ir = async (page, id) => {
  const botao = page.locator(`[data-painel-ir="${id}"]`);
  if (!(await botao.count())) {
    const pai = id.startsWith("bibliotecas") ? "Bibliotecas" : "Reprodução";
    await page.locator(`[data-painel-expandir="${pai}"]`).click();
  }
  await page.locator(`[data-painel-ir="${id}"]`).click();
  await page.waitForFunction((id) => document.querySelector(`[data-painel-ir="${id}"]`)?.classList.contains("ativo") && document.querySelector("[data-painel-titulo]") && !/Carregando/.test(document.querySelector("[data-painel-conteudo]").textContent), id);
};
const salvar = async (page) => {
  await page.locator('[data-painel-form] button[type="submit"]').click();
  await page.waitForFunction(() => /Configurações salvas\.|:/.test(document.querySelector("[data-painel-status]")?.textContent ?? ""));
  return page.locator("[data-painel-status]").innerText();
};

try {
  await req("PUT", "/api/painel/config/geral", ADMIN, { ServerName: "Pugoticine" });
  const { corpo: { paginas } } = await req("GET", "/api/painel/paginas");

  // 1) Usuário comum: sem item Painel e sem acesso a nenhuma rota do Painel.
  const marcos = await pagina("marcos");
  assert.equal(await marcos.locator("#painel-button").isVisible(), false);
  for (const rota of ["/api/painel", "/api/painel/paginas", "/api/painel/usuarios", "/api/painel/chaves", "/api/painel/backups", "/api/painel/registros", "/api/configuracao/reproducao", ...paginas.map(p => `/api/painel/config/${p.id}`)])
    assert.equal((await req("GET", rota, MARCOS)).status, 403, `marcos: ${rota}`);
  assert.equal((await req("PUT", "/api/painel/config/geral", MARCOS, { ServerName: "hack" })).status, 403);

  // 2) Admin: todas as telas pelo menu.
  const admin = await pagina("sekiro");
  await admin.evaluate(() => document.querySelector("#painel-button").click());
  await admin.waitForSelector("[data-painel-conteudo]");
  const grupos = await admin.locator(".painel-menu-grupo h4").allInnerTexts();
  assert.deepEqual(grupos.map(g => g.trim().toLowerCase()), ["servidor", "dispositivos", "tv ao vivo", "plugins", "avançado"]);
  for (const p of paginas) {
    await ir(admin, p.id);
    assert.equal((await admin.locator("[data-painel-titulo]").innerText()).trim(), p.titulo, `título de ${p.id}`);
    assert.equal(await admin.locator("[data-painel-aviso]").getAttribute("data-painel-aviso"), p.efeito.tipo, `aviso de ${p.id}`);
    if (p.efeito.tipo === "salvo") assert.match(await admin.locator("[data-painel-aviso]").innerText(), /ainda não|não aplica|não lê/i);
    if (fotos && ["painel", "reproducao-transcodificacao", "usuarios", "atividade"].includes(p.id)) await admin.screenshot({ path: path.join(fotos, `painel-${p.id}.png`), fullPage: true });
  }
  console.log(`${paginas.length} telas abertas pelo menu`);

  // 3) Geral: salvar, reler (recarregando a página) e efeito no título.
  await ir(admin, "geral");
  await admin.locator('[name="ServerName"]').fill("Cine do Sekiro");
  assert.equal(await salvar(admin), "Configurações salvas.");
  await admin.waitForFunction(() => document.title === "Cine do Sekiro");
  // Recarregar continua em /painel/geral (rotas, PQA-281) e relê do servidor.
  await admin.reload();
  await admin.waitForSelector('[name="ServerName"]');
  assert.equal(await admin.locator('[name="ServerName"]').inputValue(), "Cine do Sekiro", "relido depois de recarregar");
  assert.equal(await admin.title(), "Cine do Sekiro");

  // 4) Transcodificação: seleção, número e múltipla escolha; valor inválido mostra o erro do campo.
  await ir(admin, "reproducao-transcodificacao");
  await admin.locator('[name="HardwareAccelerationType"]').selectOption("vaapi");
  await admin.locator('[name="H264Crf"]').fill("60");
  assert.match(await salvar(admin), /máximo é 51/);
  assert.match(await admin.locator('[data-erro="H264Crf"]').innerText(), /máximo é 51/);
  await admin.locator('[name="H264Crf"]').fill("20");
  await admin.locator('[data-multipla="HardwareDecodingCodecs"] input[value="hevc"]').check();
  await admin.locator('[name="EnableThrottling"]').check();
  assert.equal(await salvar(admin), "Configurações salvas.");
  const rep = (await req("GET", "/api/configuracao/reproducao")).corpo.transcodificacao;
  assert.deepEqual([rep.HardwareAccelerationType, rep.H264Crf, [...rep.HardwareDecodingCodecs].sort(), rep.EnableThrottling], ["vaapi", 20, ["h264", "hevc", "vc1"], true]);
  await ir(admin, "geral"); await ir(admin, "reproducao-transcodificacao");
  assert.equal(await admin.locator('[name="HardwareAccelerationType"]').inputValue(), "vaapi");
  assert.equal(await admin.locator('[name="H264Crf"]').inputValue(), "20");

  // 5) DVR (só salva): relê.
  await ir(admin, "dvr");
  await admin.locator('[name="GuideDays"]').selectOption("7");
  await admin.locator('[name="RecordingPath"]').fill("/gravacoes");
  assert.equal(await salvar(admin), "Configurações salvas.");
  assert.deepEqual([(await req("GET", "/api/painel/config/dvr")).corpo.valores.GuideDays, (await req("GET", "/api/painel/config/dvr")).corpo.valores.RecordingPath], ["7", "/gravacoes"]);

  // 6) Retomar: porcentagem máxima vale de verdade (80% → 50 s de 60 s já conta como assistido).
  await ir(admin, "reproducao-retomar");
  await admin.locator('[name="MaxResumePct"]').fill("80");
  assert.equal(await salvar(admin), "Configurações salvas.");
  const filmes = (await req("GET", "/api/bootstrap", MARCOS)).corpo.media;
  const filme = filmes.find(f => f.title === "The Godfather" || f.metadata?.originalTitle === "The Godfather");
  assert.equal((await req("POST", "/api/progress", MARCOS, { mediaId: filme.id, position: 50, duration: 60 })).corpo.progress.completed, true);
  await req("PUT", "/api/painel/config/reproducao-retomar", ADMIN, { MaxResumePct: 90 });
  assert.equal((await req("POST", "/api/progress", MARCOS, { mediaId: filme.id, position: 50, duration: 60 })).corpo.progress.completed, false);

  // 7) PQA-260: a aba Marca não existe mais (serviço próprio): nem no menu, nem na API, nem CSS personalizado aplicado.
  assert.equal(await admin.locator('[data-painel-ir="marca"]').count(), 0, "sem item Marca no menu");
  assert.equal((await req("GET", "/api/painel/config/marca", ADMIN)).status, 404);
  assert.equal(await admin.locator("#css-personalizado").count(), 0);

  // 8) Usuários: marcos aparece; desativar bloqueia de verdade; reativar devolve o acesso.
  await ir(admin, "usuarios");
  await admin.locator('[data-usuario="marcos"]').click();
  await admin.locator('[data-form-usuario] [name="desativado"]').check();
  await admin.locator('[data-form-usuario] button[type="submit"]').click();
  await admin.waitForFunction(() => document.querySelector('[data-usuario="marcos"]')?.classList.contains("desativado"));
  assert.equal((await req("GET", "/api/bootstrap", MARCOS)).status, 403, "desativado não entra");
  assert.match((await req("GET", "/api/bootstrap", MARCOS)).corpo.error, /desativada/);
  await admin.locator('[data-usuario="marcos"]').click();
  await admin.locator('[data-form-usuario] [name="desativado"]').uncheck();
  await admin.locator('[data-form-usuario] button[type="submit"]').click();
  await admin.waitForFunction(() => !document.querySelector('[data-usuario="marcos"]')?.classList.contains("desativado"));
  assert.equal((await req("GET", "/api/bootstrap", MARCOS)).status, 200, "reativado entra");
  assert.equal((await req("PUT", "/api/painel/usuarios/sekiro", ADMIN, { desativado: true })).status, 400, "não desativa a si mesmo");

  // 9) Dispositivos e Atividade reais.
  await ir(admin, "dispositivos");
  const dispositivos = await admin.locator("[data-dispositivo]").allInnerTexts();
  assert.ok(dispositivos.some(d => /Chrom.* no Linux[\s\S]*marcos/.test(d)) && dispositivos.some(d => /sekiro/.test(d)), dispositivos.join(" | "));
  await ir(admin, "atividade");
  const atividade = await admin.locator("[data-painel-eventos]").innerText();
  assert.match(atividade, /Configuração alterada: Geral/);
  assert.match(atividade, /marcos está online no Pugoticine Web/);
  await admin.locator('[data-filtro="sistema"]').click();
  await admin.waitForFunction(() => document.querySelector('[data-filtro="sistema"]').classList.contains("ativo"));
  assert.doesNotMatch(await admin.locator("[data-painel-eventos]").innerText(), /marcos está online/);

  // 10) Chaves da API: criar pela tela, usar, revogar.
  await ir(admin, "chaves");
  await admin.locator('[data-nova-chave] [name="nome"]').fill("Kodi da sala");
  await admin.locator('[data-nova-chave] button[type="submit"]').click();
  const token = (await admin.locator("[data-token]").innerText()).trim();
  assert.equal((await req("GET", "/api/painel", { "X-Pugoticine-Token": token })).status, 200, "chave dá acesso");
  await admin.locator('tr:has-text("Kodi da sala") [data-revogar]').click();
  await admin.waitForFunction(() => !document.body.innerText.includes("Kodi da sala"));
  assert.equal((await req("GET", "/api/painel", { "X-Pugoticine-Token": token })).status, 401, "revogada não vale");

  // 11) Backups: criar, baixar (tar); restaurar sem digitar o nome é recusado (o fluxo completo é o PQA-240).
  await ir(admin, "backups");
  const antes = await admin.locator("[data-backup]").count();
  await admin.locator("[data-criar-backup]").click();
  await admin.waitForFunction((n) => document.querySelectorAll("[data-backup]").length === n + 1, antes);
  const nome = await admin.locator("[data-backup]").first().getAttribute("data-backup");
  const tar = await admin.evaluate(async (n) => { const r = await fetch(`/api/painel/backups/${n}`); const b = new Uint8Array(await r.arrayBuffer()); return { tipo: r.headers.get("content-type"), tamanho: b.length, ustar: new TextDecoder().decode(b.slice(257, 262)) }; }, nome);
  assert.deepEqual([tar.tipo, tar.ustar], ["application/x-tar", "ustar"]);
  assert.ok(tar.tamanho > 2048);
  await admin.locator(`[data-restaurar="${nome}"]`).click();
  await admin.waitForFunction(() => /Confirme a restauração digitando/.test(document.querySelector("#toast")?.textContent ?? ""));

  // 12) Registros: arquivo real do processo.
  await ir(admin, "registros");
  await admin.locator("[data-registro]").first().click();
  await admin.waitForFunction(() => /Pugoticine rodando/.test(document.querySelector("[data-painel-log]")?.textContent ?? ""));

  // 13) Tarefas e Bibliotecas executam de verdade.
  await ir(admin, "tarefas");
  await admin.locator('[data-executar="varredura"]').click();
  await admin.waitForFunction(() => /Concluída/.test(document.querySelector('[data-tarefa="varredura"]')?.textContent ?? ""));
  await ir(admin, "bibliotecas");
  await admin.locator("[data-rastrear]").click();
  await admin.waitForFunction(() => /Bibliotecas rastreadas/.test(document.querySelector("#toast")?.textContent ?? ""));
  assert.match(await admin.locator("[data-painel-conteudo]").innerText(), /Filmes[\s\S]*\/media\/movies/);

  await req("PUT", "/api/painel/config/geral", ADMIN, { ServerName: "Pugoticine" });
  // 14) Plugins e TV ao Vivo: honestos (sem filtros mortos, motivo explicado, botões desativados).
  await ir(admin, "plugins");
  assert.match(await admin.locator("[data-catalogo-indisponivel]").innerText(), /Catálogo indisponível: .*\.NET/);
  assert.equal(await admin.locator("[data-painel-plugins] .painel-filtro").count(), 0);
  await ir(admin, "tv-ao-vivo");
  assert.match(await admin.locator("[data-tv-indisponivel]").innerText(), /M3U\/HDHomeRun e guia XMLTV: ainda não implementados/);
  assert.equal(await admin.locator("[data-tv-indisponivel] button").isDisabled(), true);
  assert.deepEqual(erros, []);
  console.log("PQA-233 ok");
} finally {
  await navegador.close();
}
