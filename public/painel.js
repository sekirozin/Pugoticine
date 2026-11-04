import { icone as iconeTabler } from "/icones.js";
// Painel do administrador: equivale à página inicial do Painel do Jellyfin (widgets de servidor, contagens,
// dispositivos/sessões, atividade, tarefas e caminhos). Só aparece para administradores; os dados vêm de /api/painel.
const bytes = (valor) => {
  if (valor === null || valor === undefined) return "—";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  let i = 0; let v = valor;
  while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 100 ? 0 : 1 })} ${unidades[i]}`;
};
const data = (iso) => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const relativo = (iso) => {
  if (!iso) return "—";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return data(iso);
};
const tempo = (segundos) => {
  const t = Math.max(0, Math.round(segundos || 0));
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

export function renderPainel(painel, escapeHtml) {
  const e = escapeHtml;
  const s = painel.servidor;
  const linha = (rotulo, valor) => `<div class="painel-linha"><span>${e(rotulo)}</span><strong>${e(valor)}</strong></div>`;
  const cartao = (titulo, corpo, extra = "") => `<section class="painel-cartao"${extra}><h3>${e(titulo)}</h3>${corpo}</section>`;
  const discos = painel.discos.map((d) => {
    const usado = d.totalBytes ? Math.round((1 - d.livreBytes / d.totalBytes) * 100) : 0;
    return `<div class="painel-disco"><div class="painel-linha"><span>${e(d.rotulo)}</span><strong>${bytes(d.livreBytes)} livres de ${bytes(d.totalBytes)}</strong></div>
      <code>${e(d.caminho)}</code><div class="painel-barra"><div style="width:${usado}%"></div></div></div>`;
  }).join("");
  const assistindo = painel.assistindo.length
    ? painel.assistindo.map((a) => `<div class="painel-sessao"><div><strong>${e(a.titulo)}</strong><span>${e(a.usuario)} · ${tempo(a.posicao)} de ${tempo(a.duracao)}</span></div>
        <div class="painel-barra"><div style="width:${a.percentual}%"></div></div></div>`).join("")
    : `<p class="painel-vazio">Ninguém assistindo agora.</p>`;
  const atividade = painel.atividade.length
    ? `<table class="painel-tabela"><thead><tr><th>Usuário</th><th>Título</th><th>Progresso</th><th>Quando</th></tr></thead><tbody>${painel.atividade.map((a) => `
        <tr><td>${e(a.usuario)}</td><td>${e(a.titulo)}${a.ano ? ` <small>(${a.ano})</small>` : ""}</td>
        <td>${a.concluido ? "Concluído" : `${tempo(a.posicao)} de ${tempo(a.duracao)}`}</td><td>${e(relativo(a.atualizadoEm))}</td></tr>`).join("")}</tbody></table>`
    : `<p class="painel-vazio">Nenhuma atividade ainda.</p>`;
  return `<section class="section painel" data-painel>
    <div class="section-heading"><div><h2>Painel</h2><p>Visão geral do servidor, de quem está assistindo e da biblioteca.</p></div></div>
    <div class="painel-grade">
      ${cartao("Servidor", [linha("Nome", s.nome), linha("Versão", s.versao), linha("Sistema", `${s.sistema} (${s.arquitetura})`),
        linha("Processador", `${s.cpu} · ${s.nucleos} núcleos`), linha("Carga média", s.cargaMedia.join(" · ")),
        linha("Memória livre", `${bytes(s.memoriaLivre)} de ${bytes(s.memoriaTotal)}`), linha("Memória do Pugoticine", bytes(s.memoriaProcesso)),
        linha("Ligado desde", data(s.ligadoDesde)), linha("Node.js", s.node), linha("FFmpeg", s.ffmpeg)].join(""), ' data-painel-servidor')}
      ${cartao("Biblioteca", `<div class="painel-contagens">
          <div><strong data-contagem="filmes">${painel.contagens.filmes}</strong><span>Filmes</span></div>
          <div><strong>${bytes(painel.contagens.tamanhoBytes)}</strong><span>Tamanho</span></div>
          <div><strong>${painel.contagens.legendas}</strong><span>Legendas</span></div>
          <div><strong>${painel.contagens.usuariosComAtividade}</strong><span>Pessoas com atividade</span></div></div>`)}
      ${cartao("Assistindo agora", assistindo, ' data-painel-assistindo')}
    </div>
    ${cartao("Bibliotecas", painel.bibliotecas.map((b) => `<div class="painel-biblioteca">
        <div><strong>${e(b.nome)}</strong><code>${e(b.caminho)}</code><span>${b.itens} itens · última varredura ${e(relativo(b.ultimaVarredura))} · próxima ${e(data(b.proximaVarredura))}</span></div>
        <button class="painel-botao" data-painel-varrer type="button">Escanear biblioteca</button></div>`).join(""))}
    ${cartao("Atividade recente", atividade, ' data-painel-atividade')}
    <div class="painel-grade painel-grade-2">
      ${cartao("Tarefas agendadas", painel.tarefas.map((t) => `<div class="painel-tarefa"><strong>${e(t.nome)}</strong>
          <span>${e(t.categoria)} · a cada ${t.intervaloMinutos} min · última ${e(relativo(t.ultimaExecucao))} · próxima ${e(data(t.proximaExecucao))}</span></div>`).join(""))}
      ${cartao("Armazenamento", discos || `<p class="painel-vazio">Sem informações de disco.</p>`)}
    </div>
  </section>`;
}

// ======================================================================================================
// Painel completo: menu lateral do Painel do Jellyfin 10.11.10 (Servidor, Dispositivos, TV ao Vivo, Plugins,
// Avançado) com uma tela por item. As telas de configuração são montadas a partir do esquema do servidor
// (/api/painel/config/:id); as de lista têm tela própria. Cada tela mostra o que tem efeito de verdade.
const GRUPOS = ["Servidor", "Dispositivos", "TV ao Vivo", "Plugins", "Avançado"];
// Ícones do Tabler (public/icones.js) por tela do Painel.
const ICONES = {
  painel: "layout-dashboard", geral: "settings", usuarios: "users", Bibliotecas: "books", "Reprodução": "player-play",
  dispositivos: "devices", atividade: "activity", "tv-ao-vivo": "device-tv", dvr: "player-record", plugins: "plug", redes: "world",
  chaves: "key", backups: "database-export", registros: "file-text", tarefas: "list-check"
};
const icone = (nome) => iconeTabler(ICONES[nome] ?? "settings");
const AVISOS = { real: "painel-aviso-real", parcial: "painel-aviso-parcial", salvo: "painel-aviso-salvo" };

const estado = { paginas: [], atual: "painel", timer: null, container: null, f: null, abertos: new Set() };
try { estado.atual = sessionStorage.getItem("painel:pagina") || "painel"; } catch { /* sem sessionStorage */ }

// Como no Jellyfin (apps/dashboard/AppLayout.tsx + components/drawer/AppDrawer.tsx): no Painel o menu lateral do app
// dá lugar ao menu do Painel, com o cabeçalho (ícone, nome do servidor e versão) que volta para o início. Em tela
// grande o menu fica fixo; no celular abre pelo botão de menu da barra superior, como o menu normal.
export function fecharPainel() {
  clearTimeout(estado.timer); estado.timer = null; estado.container = null;
  document.querySelector("#painel-drawer")?.remove();
  document.body.classList.remove("modo-painel");
}

function drawer() {
  const sidebar = document.querySelector("#sidebar");
  let gaveta = document.querySelector("#painel-drawer");
  if (!gaveta) {
    gaveta = document.createElement("div");
    gaveta.id = "painel-drawer";
    gaveta.className = "painel-drawer";
    sidebar.append(gaveta);
  }
  document.body.classList.add("modo-painel");
  return gaveta;
}

export async function abrirPainel(container, ferramentas) {
  estado.container = container; estado.f = ferramentas;
  // A página vem do endereço (/painel/<página>), quando o app usa rotas.
  if (ferramentas.pagina) estado.atual = ferramentas.pagina;
  if (!estado.paginas.length) {
    try { estado.paginas = (await ferramentas.api("/api/painel/paginas")).paginas; }
    catch (erro) { container.innerHTML = `<div class="empty">${ferramentas.escapeHtml(erro.message)}</div>`; return; }
  }
  if (!estado.paginas.some((p) => p.id === estado.atual)) { estado.atual = "painel"; ferramentas.paginaInexistente?.(); }
  const atual = estado.paginas.find((p) => p.id === estado.atual);
  if (atual?.pai) estado.abertos.add(atual.pai);
  const gaveta = drawer();
  const servidor = estado.servidor ?? (estado.servidor = await ferramentas.api("/api/servidor").catch(() => ({})));
  gaveta.innerHTML = `<a class="painel-drawer-topo" href="/" data-painel-inicio title="Voltar para o início"><img src="/pugoticine-icon.svg?v=puci" alt=""><span><strong>${ferramentas.escapeHtml(servidor.nomeServidor || "Pugoticine")}</strong><small>${ferramentas.escapeHtml(servidor.versao || "")}</small></span></a><nav class="painel-menu" aria-label="Painel">${menu()}</nav>`;
  container.innerHTML = `<div class="painel-app"><div class="painel-conteudo" data-painel-conteudo></div></div>`;
  gaveta.querySelector("[data-painel-inicio]").addEventListener("click", (ev) => { ev.preventDefault(); ferramentas.voltarAoInicio?.(); });
  gaveta.querySelectorAll("[data-painel-ir]").forEach((b) => b.addEventListener("click", () => { ferramentas.fecharMenu?.(); irPara(b.dataset.painelIr); }));
  gaveta.querySelectorAll("[data-painel-expandir]").forEach((b) => b.addEventListener("click", () => {
    const pai = b.dataset.painelExpandir;
    estado.abertos.has(pai) ? estado.abertos.delete(pai) : estado.abertos.add(pai);
    abrirPainel(container, ferramentas);
  }));
  await mostrarPagina();
}

function irPara(id) {
  // Com rotas, o app grava /painel/<página> e chama abrirPainel de novo com ela.
  if (estado.f?.irParaPagina) { estado.tarefaAberta = null; estado.f.irParaPagina(id); return; }
  estado.atual = id;
  estado.tarefaAberta = null;
  try { sessionStorage.setItem("painel:pagina", id); } catch { /* ignora */ }
  abrirPainel(estado.container, estado.f);
}

function menu() {
  const e = estado.f.escapeHtml;
  const item = (p, sub = false) => `<button type="button" class="painel-menu-item${sub ? " sub" : ""}${p.id === estado.atual ? " ativo" : ""}" data-painel-ir="${p.id}"${p.id === estado.atual ? ' aria-current="page"' : ""}>${sub ? "" : icone(p.id)}<span>${e(p.titulo === "Configurações de NFO" ? "NFO" : p.titulo === "Pré-visualizações de vídeo" ? "Trickplay" : p.titulo)}</span></button>`;
  return GRUPOS.map((grupo) => {
    const doGrupo = estado.paginas.filter((p) => p.grupo === grupo);
    const html = [];
    for (const p of doGrupo) {
      if (!p.pai) { html.push(item(p)); continue; }
      if (html.includes(`pai:${p.pai}`)) continue;
      html.push(`pai:${p.pai}`);
      const filhos = doGrupo.filter((x) => x.pai === p.pai);
      const aberto = estado.abertos.has(p.pai);
      html.push(`<button type="button" class="painel-menu-item${filhos.some((x) => x.id === estado.atual) ? " contem-ativo" : ""}" data-painel-expandir="${e(p.pai)}" aria-expanded="${aberto}">${icone(p.pai)}<span>${e(p.pai)}</span><b class="painel-seta">${aberto ? "▾" : "▸"}</b></button>`);
      if (aberto) html.push(...filhos.map((x) => item(x, true)));
    }
    return `<div class="painel-menu-grupo"><h4>${e(grupo)}</h4>${html.filter((h) => !h.startsWith("pai:")).join("")}</div>`;
  }).join("");
}

async function mostrarPagina() {
  clearTimeout(estado.timer);
  const alvo = estado.container?.querySelector("[data-painel-conteudo]");
  if (!alvo) return;
  const p = estado.paginas.find((x) => x.id === estado.atual);
  const e = estado.f.escapeHtml;
  const aviso = `<p class="painel-aviso ${AVISOS[p.efeito.tipo]}" data-painel-aviso="${p.efeito.tipo}">${e(p.efeito.texto)}</p>`;
  const cabecalho = (extra = "") => `<div class="painel-cabecalho"><h2 data-painel-titulo>${e(p.titulo)}</h2>${extra}</div>${aviso}`;
  try {
    const telas = { painel: telaVisaoGeral, usuarios: telaUsuarios, bibliotecas: telaBibliotecas, dispositivos: telaDispositivos, atividade: telaAtividade, "tv-ao-vivo": telaTvAoVivo, chaves: telaChaves, backups: telaBackups, tarefas: telaTarefas };
    if (telas[p.id]) { await telas[p.id](alvo, cabecalho); return; }
    // Telas de configuração (e Plugins/Registros, que têm configuração e lista).
    const { pagina, valores } = await estado.f.api(`/api/painel/config/${p.id}`);
    alvo.innerHTML = `${cabecalho()}${p.id === "plugins" ? listaPlugins() : ""}${formulario(pagina, valores)}${p.id === "registros" ? '<section class="painel-cartao"><h3>Arquivos de registro</h3><div data-painel-arquivos>Carregando...</div><pre class="painel-log" data-painel-log hidden></pre></section>' : ""}`;
    ligarFormulario(alvo, pagina);
    if (p.id === "registros") await listaRegistros(alvo);
  } catch (erro) {
    alvo.innerHTML = `${cabecalho()}<div class="empty">${e(erro.message)}</div>`;
  }
}

// ---------- formulário genérico ----------
function campoHtml(c, valor) {
  const e = estado.f.escapeHtml;
  const id = `campo-${c.chave}`;
  const ajuda = c.ajuda ? `<small class="painel-ajuda">${e(c.ajuda)}</small>` : "";
  if (c.tipo === "booleano") return `<label class="painel-campo painel-check"><input type="checkbox" name="${c.chave}" ${valor ? "checked" : ""}><span>${e(c.rotulo)}</span></label>${ajuda}`;
  let entrada;
  if (c.tipo === "selecao") entrada = `<select id="${id}" name="${c.chave}">${c.opcoes.map((o) => `<option value="${e(o.valor)}" ${String(valor) === o.valor ? "selected" : ""}>${e(o.rotulo)}</option>`).join("")}</select>`;
  else if (c.tipo === "multipla") entrada = `<div class="painel-multipla" data-multipla="${c.chave}">${c.opcoes.map((o) => `<label class="painel-check"><input type="checkbox" value="${e(o.valor)}" ${valor.includes(o.valor) ? "checked" : ""}><span>${e(o.rotulo)}</span></label>`).join("")}</div>`;
  else if (c.tipo === "lista" || c.tipo === "textoLongo") entrada = `<textarea id="${id}" name="${c.chave}" rows="${c.tipo === "lista" ? 3 : 6}">${e(c.tipo === "lista" ? valor.join("\n") : valor ?? "")}</textarea>`;
  else entrada = `<input id="${id}" name="${c.chave}" type="${c.tipo === "numero" ? "number" : c.tipo === "senha" ? "password" : "text"}" value="${e(valor ?? "")}"${c.min !== undefined ? ` min="${c.min}"` : ""}${c.max !== undefined ? ` max="${c.max}"` : ""}${c.tipo === "numero" ? ' step="any"' : ""}>`;
  return `<label class="painel-campo" for="${id}"><span>${e(c.rotulo)}</span>${entrada}</label>${ajuda}`;
}

function formulario(pagina, valores) {
  const e = estado.f.escapeHtml;
  return `<form class="painel-form" data-painel-form="${pagina.id}" novalidate>${pagina.secoes.map((s) => `<section class="painel-cartao">${s.titulo ? `<h3>${e(s.titulo)}</h3>` : ""}${s.campos.map((c) => `<div class="painel-grupo-campo" data-campo="${c.chave}">${campoHtml(c, valores[c.chave])}<small class="painel-erro" data-erro="${c.chave}"></small></div>`).join("")}</section>`).join("")}
    <div class="painel-acoes"><button type="submit" class="painel-botao primario">Salvar</button><span class="painel-status" data-painel-status role="status"></span></div></form>`;
}

function ligarFormulario(alvo, pagina) {
  const form = alvo.querySelector("[data-painel-form]");
  if (!form) return;
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = {};
    for (const s of pagina.secoes) for (const c of s.campos) {
      if (c.tipo === "booleano") dados[c.chave] = form.querySelector(`[name="${c.chave}"]`).checked;
      else if (c.tipo === "multipla") dados[c.chave] = [...form.querySelectorAll(`[data-multipla="${c.chave}"] input:checked`)].map((i) => i.value);
      else dados[c.chave] = form.querySelector(`[name="${c.chave}"]`).value;
    }
    form.querySelectorAll("[data-erro]").forEach((x) => { x.textContent = ""; });
    const status = form.querySelector("[data-painel-status]");
    status.textContent = "Salvando...";
    try {
      const resposta = await fetch(`/api/painel/config/${pagina.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        status.textContent = corpo.error || "Não foi possível salvar.";
        if (corpo.campo) form.querySelector(`[data-erro="${corpo.campo}"]`).textContent = corpo.error;
        return;
      }
      status.textContent = "Configurações salvas.";
      estado.f.toast("Configurações salvas.");
      if (pagina.id === "geral") { estado.servidor = null; estado.f.aoMudarServidor?.(); }
    } catch (erro) { status.textContent = erro.message; }
  });
}

// ---------- telas de lista ----------
const tabela = (cabecalhos, linhas, vazio) => linhas.length
  ? `<div class="painel-tabela-rolagem"><table class="painel-tabela"><thead><tr>${cabecalhos.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${linhas.join("")}</tbody></table></div>`
  : `<p class="painel-vazio">${vazio}</p>`;

async function telaVisaoGeral(alvo, cabecalho) {
  const painel = await estado.f.api("/api/painel");
  if (estado.atual !== "painel" || !alvo.isConnected) return;
  alvo.innerHTML = cabecalho() + renderPainel(painel, estado.f.escapeHtml).replace(/<div class="section-heading">[\s\S]*?<\/div><\/div>/, "");
  alvo.querySelector("[data-painel-varrer]")?.addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true; ev.currentTarget.textContent = "Escaneando...";
    const r = await estado.f.api("/api/catalog/scan", { method: "POST", body: "{}" }).catch((erro) => { estado.f.toast(erro.message); return null; });
    if (r) { estado.f.aoVarrer?.(r.media); estado.f.toast(`Biblioteca atualizada: ${r.media.length} filme(s).`); }
    mostrarPagina();
  });
  estado.timer = setTimeout(() => { if (estado.atual === "painel" && alvo.isConnected) mostrarPagina(); }, 10000);
}

async function telaUsuarios(alvo, cabecalho) {
  const e = estado.f.escapeHtml;
  const { usuarios, voce } = await estado.f.api("/api/painel/usuarios");
  estado.bibliotecas = (await estado.f.api("/api/painel/bibliotecas")).bibliotecas;
  alvo.innerHTML = cabecalho() + `<section class="painel-cartao"><div class="painel-usuarios">${usuarios.map((u) => `
    <button type="button" class="painel-usuario${u.desativado ? " desativado" : ""}" data-usuario="${e(u.usuario)}">
      <span class="painel-avatar">${e(u.nome.charAt(0).toUpperCase())}</span><strong>${e(u.nome)}</strong>
      <small>${u.papel === "admin" ? "Administrador" : "Usuário"}${u.desativado ? " · Desativado" : ""}</small><small>Último acesso ${e(relativo(u.ultimoAcesso))}</small></button>`).join("") || '<p class="painel-vazio">Ninguém entrou ainda.</p>'}</div></section><div data-painel-editar-usuario></div>`;
  alvo.querySelectorAll("[data-usuario]").forEach((b) => b.addEventListener("click", () => editarUsuario(alvo, usuarios.find((u) => u.usuario === b.dataset.usuario), voce)));
}

function editarUsuario(alvo, u, voce) {
  const e = estado.f.escapeHtml;
  const area = alvo.querySelector("[data-painel-editar-usuario]");
  area.innerHTML = `<form class="painel-form" data-form-usuario><section class="painel-cartao"><h3>Editar usuário: ${e(u.nome)}</h3>
    ${u.desativado ? '<p class="painel-aviso painel-aviso-salvo">Este usuário está desativado atualmente</p>' : ""}
    <label class="painel-campo"><span>Nome</span><input value="${e(u.nome)}" disabled></label><small class="painel-ajuda">Nome, senha e imagem são da conta do Pugotilab.</small>
    <label class="painel-campo painel-check"><input type="checkbox" disabled ${u.papel === "admin" ? "checked" : ""}><span>Permitir que este usuário gerencie o servidor</span></label><small class="painel-ajuda">Definido pelo Pugotilab.</small>
    <h3>Acesso aos Recursos</h3>
    <label class="painel-campo painel-check"><input type="checkbox" name="desativado" ${u.desativado ? "checked" : ""} ${u.usuario === voce ? "disabled" : ""}><span>Desativar este usuário</span></label><small class="painel-ajuda">Tem efeito: o usuário desativado não consegue usar o Pugoticine.</small>
    <label class="painel-campo painel-check"><input type="checkbox" name="oculto" ${u.oculto ? "checked" : ""}><span>Ocultar este usuário das telas de login</span></label>
    <label class="painel-campo"><span>Limite do bitrate para streaming da internet (Mbps)</span><input type="number" name="limiteBitrateMbps" min="0" max="1000" step="any" value="${u.limiteBitrateMbps}"></label>
    <label class="painel-campo"><span>Número máximo de sessões de usuários simultâneas</span><input type="number" name="maxSessoes" min="0" max="100" value="${u.maxSessoes}"></label>
    <label class="painel-campo"><span>Acesso às salas (SyncPlay)</span><select name="acessoSalas">${[["criar", "Permitir que o usuário crie e participe em grupos"], ["participar", "Permitir que o usuário participe de grupos"], ["nenhum", "Desativado para esse usuário"]].map(([v, r]) => `<option value="${v}" ${u.acessoSalas === v ? "selected" : ""}>${r}</option>`).join("")}</select></label>
    <small class="painel-ajuda">Ocultar, bitrate, sessões e salas: ainda não implementados no Pugoticine (são salvos).</small>
    <h3>Acesso à Biblioteca</h3>
    <label class="painel-campo painel-check"><input type="checkbox" name="todasBibliotecas" ${u.todasBibliotecas ? "checked" : ""}><span>Ativar o acesso a todas as bibliotecas</span></label>
    <div class="painel-multipla" data-bibliotecas-usuario>${(estado.bibliotecas ?? []).map((b) => `<label class="painel-check"><input type="checkbox" value="${e(b.id)}" ${u.bibliotecas.includes(b.id) ? "checked" : ""}><span>${e(b.nome)}</span></label>`).join("")}</div>
    <small class="painel-ajuda">Selecione as bibliotecas para compartilhar com este usuário. Tem efeito: o usuário só vê e só abre o que estiver liberado (administradores veem tudo).</small>
    <h3>Classificações Etárias</h3>
    <label class="painel-campo"><span>Classificação etária máxima permitida</span><select name="classificacaoMaxima">${[["", "Sem limite"], ["0", "Livre"], ["10", "10 anos"], ["12", "12 anos"], ["14", "14 anos"], ["16", "16 anos"], ["18", "18 anos"]].map(([v, r]) => `<option value="${v}" ${String(u.classificacaoMaxima ?? "") === v ? "selected" : ""}>${r}</option>`).join("")}</select></label>
    <small class="painel-ajuda">Conteúdo com classificação maior será ocultado do usuário (pela classificação do Radarr, ex.: PG-13 = 13 anos).</small>
    <label class="painel-campo painel-check"><input type="checkbox" name="bloquearSemClassificacao" ${u.bloquearSemClassificacao ? "checked" : ""}><span>Bloquear itens com avaliação desconhecida ou sem avaliação</span></label>
    <div class="painel-acoes"><button type="submit" class="painel-botao primario">Salvar</button><button type="button" class="painel-botao" data-cancelar>Cancelar</button>${u.usuario !== voce ? '<button type="button" class="painel-botao perigo" data-excluir-usuario>Excluir Usuário</button>' : ""}<span class="painel-status" data-painel-status></span></div></section></form>`;
  const form = area.querySelector("form");
  form.querySelector("[data-cancelar]").addEventListener("click", () => { area.innerHTML = ""; });
  form.querySelector("[data-excluir-usuario]")?.addEventListener("click", async () => {
    if (!confirm("Deseja realmente excluir este usuário?")) return;
    await fetch(`/api/painel/usuarios/${encodeURIComponent(u.usuario)}`, { method: "DELETE" });
    mostrarPagina();
  });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const dados = { oculto: form.oculto.checked, limiteBitrateMbps: form.limiteBitrateMbps.value, maxSessoes: form.maxSessoes.value, acessoSalas: form.acessoSalas.value,
      todasBibliotecas: form.todasBibliotecas.checked, bibliotecas: [...form.querySelectorAll("[data-bibliotecas-usuario] input:checked")].map((i) => i.value),
      classificacaoMaxima: form.classificacaoMaxima.value === "" ? null : Number(form.classificacaoMaxima.value), bloquearSemClassificacao: form.bloquearSemClassificacao.checked };
    if (!form.desativado.disabled) dados.desativado = form.desativado.checked;
    const r = await fetch(`/api/painel/usuarios/${encodeURIComponent(u.usuario)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });
    const corpo = await r.json();
    form.querySelector("[data-painel-status]").textContent = r.ok ? "Configurações salvas." : corpo.error;
    if (r.ok) { estado.f.toast("Configurações salvas."); setTimeout(mostrarPagina, 300); }
  });
}

async function telaBibliotecas(alvo, cabecalho) {
  const e = estado.f.escapeHtml;
  const dados = await estado.f.api("/api/painel/bibliotecas");
  const tipo = (v) => dados.tipos.find((x) => x.valor === v)?.rotulo ?? v;
  alvo.innerHTML = cabecalho(`<div class="painel-acoes-topo"><button type="button" class="painel-botao" data-adicionar-biblioteca>Adicionar Biblioteca de Mídia</button><button type="button" class="painel-botao primario" data-rastrear>Rastrear Todas as Bibliotecas</button></div>`)
    + `<div data-editor-biblioteca></div><div class="painel-bibliotecas">${dados.bibliotecas.map((b) => `<section class="painel-cartao painel-biblioteca-cartao${b.ativa ? "" : " inativa"}" data-biblioteca="${e(b.id)}">
      <div class="painel-biblioteca-icone">${icone("Bibliotecas")}</div><h3>${e(b.nome)}</h3><span>${e(tipo(b.tipo))} · ${b.itens} itens${b.ativa ? "" : " · desativada"}${b.monitorar ? " · monitorada" : ""}</span>
      ${b.pastas.map((p) => `<code>${e(p)}</code>`).join("")}<span>Última varredura ${e(relativo(b.ultimaVarredura))}</span>
      <div class="painel-acoes-linha"><button type="button" class="painel-botao pequeno" data-rastrear-biblioteca="${e(b.id)}">Rastrear biblioteca</button><button type="button" class="painel-botao pequeno" data-editar-biblioteca="${e(b.id)}">Editar</button><button type="button" class="painel-botao pequeno perigo" data-remover-biblioteca="${e(b.id)}">Remover</button></div></section>`).join("") || '<p class="painel-vazio">Nenhuma biblioteca.</p>'}</div>`;
  alvo.querySelector("[data-rastrear]").addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true; ev.currentTarget.textContent = "Rastreando...";
    await estado.f.api("/api/painel/bibliotecas/rastrear", { method: "POST", body: "{}" });
    estado.f.toast("Bibliotecas rastreadas.");
    mostrarPagina();
  });
  alvo.querySelectorAll("[data-rastrear-biblioteca]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true; b.textContent = "Rastreando...";
    await estado.f.api(`/api/painel/bibliotecas/${b.dataset.rastrearBiblioteca}/rastrear`, { method: "POST", body: "{}" });
    estado.f.toast("Biblioteca rastreada.");
    mostrarPagina();
  }));
  alvo.querySelectorAll("[data-remover-biblioteca]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Deseja realmente remover esta biblioteca? Os arquivos não serão apagados.")) return;
    await fetch(`/api/painel/bibliotecas/${b.dataset.removerBiblioteca}`, { method: "DELETE" });
    mostrarPagina();
  }));
  alvo.querySelector("[data-adicionar-biblioteca]").addEventListener("click", () => editarBiblioteca(alvo, dados, null));
  alvo.querySelectorAll("[data-editar-biblioteca]").forEach((b) => b.addEventListener("click", () => editarBiblioteca(alvo, dados, dados.bibliotecas.find((x) => x.id === b.dataset.editarBiblioteca))));
}

function editarBiblioteca(alvo, dados, b) {
  const e = estado.f.escapeHtml;
  const area = alvo.querySelector("[data-editor-biblioteca]");
  const pastas = [...(b?.pastas ?? [])];
  area.innerHTML = `<form class="painel-form painel-cartao" data-form-biblioteca><h3>${b ? `Editar: ${e(b.nome)}` : "Adicionar Biblioteca de Mídia"}</h3>
    <label class="painel-campo"><span>Tipo de conteúdo</span><select name="tipo">${dados.tipos.map((t) => `<option value="${t.valor}" ${(b?.tipo ?? "movies") === t.valor ? "selected" : ""}>${e(t.rotulo)}</option>`).join("")}</select></label>
    <label class="painel-campo"><span>Nome para exibição</span><input name="nome" maxlength="80" value="${e(b?.nome ?? "")}"></label>
    <div class="painel-campo"><span>Pastas</span><div data-lista-pastas></div><button type="button" class="painel-botao pequeno" data-escolher-pasta>Adicionar pasta</button><div data-seletor-pasta></div></div>
    <small class="painel-ajuda">Pastas permitidas: ${dados.raizesPermitidas.map(e).join(", ")}.</small>
    <h3>Opções da biblioteca</h3>
    <label class="painel-campo painel-check"><input type="checkbox" name="ativa" ${b?.ativa ?? true ? "checked" : ""}><span>Ativar esta biblioteca</span></label>
    <label class="painel-campo painel-check"><input type="checkbox" name="monitorar" ${b?.monitorar ? "checked" : ""}><span>Ativar monitoramento em tempo real</span></label><small class="painel-ajuda">As alterações nos arquivos serão processadas imediatamente em sistemas de arquivos suportados.</small>
    <label class="painel-campo"><span>Idioma preferido de download</span><select name="idiomaMetadados">${[["pt", "Português"], ["en", "English"], ["es", "Español"], ["ja", "日本語"]].map(([v, r]) => `<option value="${v}" ${(b?.idiomaMetadados ?? "pt") === v ? "selected" : ""}>${r}</option>`).join("")}</select></label>
    <label class="painel-campo"><span>País/Região</span><select name="paisMetadados">${[["BR", "Brasil"], ["PT", "Portugal"], ["US", "Estados Unidos"], ["JP", "Japão"]].map(([v, r]) => `<option value="${v}" ${(b?.paisMetadados ?? "BR") === v ? "selected" : ""}>${r}</option>`).join("")}</select></label>
    <label class="painel-campo"><span>Atualizar automaticamente os metadados da internet</span><select name="intervaloAtualizacaoDias">${[[0, "Nunca"], [30, "A cada 30 dias"], [60, "A cada 60 dias"], [90, "A cada 90 dias"]].map(([v, r]) => `<option value="${v}" ${(b?.intervaloAtualizacaoDias ?? 0) === v ? "selected" : ""}>${r}</option>`).join("")}</select></label>
    <small class="painel-ajuda">Idioma, país e atualização automática: ainda não implementados no Pugoticine (são salvos).</small>
    <div class="painel-acoes"><button type="submit" class="painel-botao primario">${b ? "Salvar" : "Adicionar"}</button><button type="button" class="painel-botao" data-cancelar>Cancelar</button><span class="painel-status" data-painel-status></span></div></form>`;
  const form = area.querySelector("form");
  const desenharPastas = () => {
    form.querySelector("[data-lista-pastas]").innerHTML = pastas.length
      ? pastas.map((p, i) => `<div class="painel-pasta"><code>${e(p)}</code><button type="button" class="painel-botao pequeno perigo" data-tirar-pasta="${i}">Remover</button></div>`).join("")
      : '<p class="painel-vazio">Nenhuma pasta.</p>';
    form.querySelectorAll("[data-tirar-pasta]").forEach((x) => x.addEventListener("click", () => { pastas.splice(Number(x.dataset.tirarPasta), 1); desenharPastas(); }));
  };
  desenharPastas();
  const seletor = form.querySelector("[data-seletor-pasta]");
  const navegar = async (caminho) => {
    const r = await estado.f.api(`/api/painel/pastas${caminho ? `?caminho=${encodeURIComponent(caminho)}` : ""}`);
    seletor.innerHTML = `<div class="painel-seletor"><div class="painel-seletor-topo"><strong>${e(r.caminho ?? "Pastas de mídia")}</strong>${r.caminho ? `<button type="button" class="painel-botao pequeno primario" data-usar-pasta>Selecionar esta pasta</button>` : ""}</div>
      ${r.pai || r.caminho ? `<button type="button" class="painel-seletor-item" data-ir-pasta="${e(r.pai ?? "")}">⬑ Subir</button>` : ""}${r.pastas.map((p) => `<button type="button" class="painel-seletor-item" data-ir-pasta="${e(p)}">📁 ${e(p.split("/").pop())}</button>`).join("") || '<p class="painel-vazio">Sem subpastas.</p>'}</div>`;
    seletor.querySelectorAll("[data-ir-pasta]").forEach((x) => x.addEventListener("click", () => navegar(x.dataset.irPasta)));
    seletor.querySelector("[data-usar-pasta]")?.addEventListener("click", () => { if (!pastas.includes(r.caminho)) pastas.push(r.caminho); seletor.innerHTML = ""; desenharPastas(); });
  };
  form.querySelector("[data-escolher-pasta]").addEventListener("click", () => navegar(null));
  form.querySelector("[data-cancelar]").addEventListener("click", () => { area.innerHTML = ""; });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const corpo = { nome: form.nome.value, tipo: form.tipo.value, pastas, ativa: form.ativa.checked, monitorar: form.monitorar.checked,
      idiomaMetadados: form.idiomaMetadados.value, paisMetadados: form.paisMetadados.value, intervaloAtualizacaoDias: Number(form.intervaloAtualizacaoDias.value) };
    const r = await fetch(b ? `/api/painel/bibliotecas/${b.id}` : "/api/painel/bibliotecas", { method: b ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const resposta = await r.json();
    if (!r.ok) { form.querySelector("[data-painel-status]").textContent = resposta.error; return; }
    estado.f.toast(b ? "Biblioteca salva." : "Biblioteca adicionada.");
    mostrarPagina();
  });
}

async function telaDispositivos(alvo, cabecalho) {
  const e = estado.f.escapeHtml;
  const { dispositivos } = await estado.f.api("/api/painel/dispositivos");
  alvo.innerHTML = cabecalho(`<button type="button" class="painel-botao perigo" data-excluir-todos ${dispositivos.length ? "" : "disabled"}>Excluir tudo</button>`) + `<section class="painel-cartao">${tabela(
    ["Dispositivo", "Nome do app", "Usuário", "Ultima vez ativo", ""],
    dispositivos.map((d) => `<tr data-dispositivo="${d.id}"><td>${e(d.nome)}<small class="painel-ajuda">${e(d.ip)}</small></td><td>${e(d.aplicativo)}</td><td>${e(d.usuario)}</td><td>${e(relativo(d.ultimoAcesso))}</td><td><button type="button" class="painel-botao pequeno" data-excluir-dispositivo="${d.id}">Excluir</button></td></tr>`),
    "Nenhum dispositivo.")}</section>`;
  alvo.querySelectorAll("[data-excluir-dispositivo]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Deseja realmente excluir este dispositivo? Ele reaparecerá da próxima vez que um usuário entrar com ele.")) return;
    await fetch(`/api/painel/dispositivos/${b.dataset.excluirDispositivo}`, { method: "DELETE" });
    mostrarPagina();
  }));
  alvo.querySelector("[data-excluir-todos]")?.addEventListener("click", async () => {
    if (!confirm("Tem certeza de que deseja excluir todos os dispositivos?")) return;
    await fetch("/api/painel/dispositivos", { method: "DELETE" });
    mostrarPagina();
  });
}

async function telaAtividade(alvo, cabecalho) {
  const e = estado.f.escapeHtml;
  const filtro = estado.filtroAtividade ?? "";
  const { eventos } = await estado.f.api(`/api/painel/atividade${filtro ? `?tipo=${filtro}` : ""}`);
  const niveis = { Information: "Informação", Warning: "Aviso", Error: "Erro" };
  alvo.innerHTML = cabecalho(`<div class="painel-filtros">${[["", "Todos"], ["usuario", "Usuário"], ["sistema", "Sistema"]].map(([v, r]) => `<button type="button" class="painel-filtro${v === filtro ? " ativo" : ""}" data-filtro="${v}">${r}</button>`).join("")}</div>`)
    + `<section class="painel-cartao" data-painel-eventos>${tabela(["Hora", "Usuário", "Nível", "Nome", "Tipo"],
      eventos.map((ev) => `<tr><td>${e(data(ev.data))}</td><td>${e(ev.usuario ?? "Sistema")}</td><td><span class="painel-nivel ${ev.nivel}">${niveis[ev.nivel] ?? ev.nivel}</span></td><td>${e(ev.nome)}${ev.detalhe ? `<small class="painel-ajuda">${e(ev.detalhe)}</small>` : ""}</td><td>${e(ev.tipo)}</td></tr>`),
      "Nenhuma atividade registrada.")}</section>`;
  alvo.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => { estado.filtroAtividade = b.dataset.filtro; mostrarPagina(); }));
}

async function telaTvAoVivo(alvo, cabecalho) {
  alvo.innerHTML = cabecalho() + `<section class="painel-cartao" data-tv-indisponivel><h3>Sintonizadores</h3><p class="painel-vazio">Nenhum sintonizador.</p>
    <p class="painel-ajuda">Sintonizador M3U/HDHomeRun e guia XMLTV: ainda não implementados no Pugoticine. Para assistir canais ao vivo o player precisa tocar transmissões contínuas, o que ainda não existe; adicionar um sintonizador agora só criaria uma lista que não toca. Por isso os botões estão desativados.</p>
    <button type="button" class="painel-botao" disabled>Adicionar sintonizador</button></section>
    <section class="painel-cartao"><h3>Provedores de Dados do Guia da TV</h3><p class="painel-vazio">Nenhum provedor.</p><button type="button" class="painel-botao" disabled>Adicionar provedor</button> <button type="button" class="painel-botao" disabled>Atualizar Dados do Guia</button></section>`;
}

function listaPlugins() {
  const integracoes = [
    ["Login do Pugotilab", "Contas, senhas e sessões vêm do Pugotilab (no Jellyfin seria um plugin de autenticação)."],
    ["Metadados do Radarr", "Sinopse, pôster, notas e classificação dos filmes (no Jellyfin seriam os plugins TMDb/OMDb)."],
    ["Nomes de séries e animes", "Temporada e episódio pelas regras de nomes do Jellyfin."]
  ];
  return `<section class="painel-cartao" data-painel-plugins><h3>Meus Plugins</h3><p class="painel-vazio">Nenhum plugin instalado.</p>
    <h3>Catálogo</h3><p class="painel-ajuda" data-catalogo-indisponivel>Catálogo indisponível: os plugins do Jellyfin são bibliotecas .NET e o Pugoticine roda em Node, então eles não podem ser instalados aqui. Os repositórios abaixo são só salvos.</p>
    <h3>Integrações embutidas</h3><p class="painel-ajuda">Fazem parte do Pugoticine (não são plugins e não podem ser desinstaladas):</p>
    ${integracoes.map(([nome, texto]) => `<div class="painel-pasta"><span><strong>${nome}</strong><small class="painel-ajuda">${texto}</small></span></div>`).join("")}</section>`;
}

async function telaChaves(alvo, cabecalho) {
  const e = estado.f.escapeHtml;
  const { chaves } = await estado.f.api("/api/painel/chaves");
  alvo.innerHTML = cabecalho() + `<section class="painel-cartao"><form class="painel-nova-chave" data-nova-chave><h3>Nova Chave de API</h3>
      <label class="painel-campo"><span>Nome do app</span><input name="nome" maxlength="80" required></label><small class="painel-ajuda">Uma leitura humana para identificar chaves API. Essa configuração não afetará funcionalidade.</small>
      <div class="painel-acoes"><button type="submit" class="painel-botao primario">Criar</button></div><div data-chave-criada></div></form></section>
    <section class="painel-cartao">${tabela(["Chave da API", "Aplicativo", "Data da Emissão", "Último uso", ""],
      chaves.map((c) => `<tr data-chave="${c.id}"><td><code>${e(c.prefixo)}…</code></td><td>${e(c.nome)}</td><td>${e(data(c.criadoEm))}</td><td>${e(relativo(c.ultimoUso))}</td><td><button type="button" class="painel-botao pequeno perigo" data-revogar="${c.id}">Revogar</button></td></tr>`),
      "Nenhuma chave criada.")}</section>`;
  alvo.querySelector("[data-nova-chave]").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const r = await fetch("/api/painel/chaves", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome: ev.currentTarget.nome.value }) });
    const corpo = await r.json();
    if (!r.ok) { estado.f.toast(corpo.error); return; }
    await mostrarPagina();
    alvo.querySelector("[data-chave-criada]").innerHTML = `<p class="painel-aviso painel-aviso-real">Copie a chave agora; ela não será mostrada de novo. Use no cabeçalho <code>X-Pugoticine-Token</code>.</p><code class="painel-token" data-token>${e(corpo.token)}</code>`;
  });
  alvo.querySelectorAll("[data-revogar]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Tem certeza que deseja revogar esta chave de API? A conexão da aplicação com este servidor será encerrada abruptamente.")) return;
    await fetch(`/api/painel/chaves/${b.dataset.revogar}`, { method: "DELETE" });
    mostrarPagina();
  }));
}

async function telaBackups(alvo, cabecalho) {
  const e = estado.f.escapeHtml;
  const { backups, restauracaoPendente: pendente } = await estado.f.api("/api/painel/backups");
  const aviso = pendente ? `<section class="painel-cartao painel-aviso-restauracao" data-restauracao-pendente><h3>Restauração agendada</h3>
    <p>O backup <strong>${e(pendente.backup)}</strong> será aplicado quando o Pugoticine reiniciar. Reinicie o container para concluir (no ZimaOS: reiniciar o app Pugoticine).</p>
    <p class="painel-ajuda">Antes foi criado o backup de segurança <strong>${e(pendente.seguranca)}</strong>, para voltar atrás se precisar.</p>
    <div class="painel-acoes"><button type="button" class="painel-botao" data-cancelar-restauracao>Cancelar restauração</button></div></section>` : "";
  alvo.innerHTML = cabecalho(`<button type="button" class="painel-botao primario" data-criar-backup>Criar backup</button>`) + aviso + `<section class="painel-cartao">${tabela(["Arquivo", "Tamanho", "Criado em", ""],
    backups.map((b) => `<tr data-backup="${e(b.nome)}"><td>${e(b.nome)}</td><td>${bytes(b.tamanho)}</td><td>${e(data(b.criadoEm))}</td><td class="painel-acoes-linha"><a class="painel-botao pequeno" href="/api/painel/backups/${encodeURIComponent(b.nome)}" download>Baixar</a><button type="button" class="painel-botao pequeno" data-restaurar="${e(b.nome)}">Restaurar</button><button type="button" class="painel-botao pequeno perigo" data-excluir-backup="${e(b.nome)}">Excluir</button></td></tr>`),
    "Nenhum backup ainda.")}</section>`;
  alvo.querySelector("[data-criar-backup]").addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true; ev.currentTarget.textContent = "Criando...";
    const r = await estado.f.api("/api/painel/backups", { method: "POST", body: "{}" }).catch((erro) => { estado.f.toast(erro.message); return null; });
    if (r) estado.f.toast(`Backup criado: ${r.backup.nome}`);
    mostrarPagina();
  });
  alvo.querySelectorAll("[data-restaurar]").forEach((b) => b.addEventListener("click", async () => {
    const nome = b.dataset.restaurar;
    const digitado = prompt(`Restaurar substitui TODOS os dados atuais (progresso, usuários, bibliotecas, configurações e salas) pelos do backup.\nUm backup de segurança será criado antes.\n\nPara confirmar, digite o nome do backup:\n${nome}`);
    if (digitado === null) return;
    const r = await fetch(`/api/painel/backups/${encodeURIComponent(nome)}/restaurar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmar: digitado.trim() }) });
    const corpo = await r.json();
    estado.f.toast(r.ok ? "Restauração agendada: reinicie o Pugoticine para aplicar." : corpo.error);
    mostrarPagina();
  }));
  alvo.querySelector("[data-cancelar-restauracao]")?.addEventListener("click", async () => {
    await fetch("/api/painel/backups/restauracao", { method: "DELETE" });
    estado.f.toast("Restauração cancelada.");
    mostrarPagina();
  });
  alvo.querySelectorAll("[data-excluir-backup]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Excluir este backup?")) return;
    await fetch(`/api/painel/backups/${encodeURIComponent(b.dataset.excluirBackup)}`, { method: "DELETE" });
    mostrarPagina();
  }));
}

async function listaRegistros(alvo) {
  const e = estado.f.escapeHtml;
  const { arquivos } = await estado.f.api("/api/painel/registros");
  const lista = alvo.querySelector("[data-painel-arquivos]");
  lista.innerHTML = arquivos.length ? `<div class="painel-registros">${arquivos.map((a) => `<button type="button" class="painel-registro" data-registro="${e(a.nome)}"><strong>${e(a.nome)}</strong><small>${bytes(a.tamanho)} · ${e(data(a.modificadoEm))}</small></button>`).join("")}</div>` : '<p class="painel-vazio">Nenhum arquivo de registro.</p>';
  lista.querySelectorAll("[data-registro]").forEach((b) => b.addEventListener("click", async () => {
    const r = await fetch(`/api/painel/registros/${encodeURIComponent(b.dataset.registro)}`);
    const pre = alvo.querySelector("[data-painel-log]");
    pre.hidden = false;
    pre.textContent = await r.text();
    pre.scrollTop = pre.scrollHeight;
  }));
}

async function telaTarefas(alvo, cabecalho) {
  const e = estado.f.escapeHtml;
  if (estado.tarefaAberta) return telaTarefa(alvo, cabecalho, estado.tarefaAberta);
  const { tarefas } = await estado.f.api("/api/painel/tarefas");
  const resultado = { Completed: "Concluída", Failed: "Falhou" };
  const duracao = (ms) => ms === null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  const categorias = [...new Set(tarefas.map((t) => t.categoria))];
  alvo.innerHTML = cabecalho() + categorias.map((categoria) => `<section class="painel-cartao"><h3>${e(categoria)}</h3>${tarefas.filter((t) => t.categoria === categoria).map((t) => `
    <div class="painel-tarefa-linha" data-tarefa="${t.id}"><div><button type="button" class="painel-link" data-abrir-tarefa="${t.id}"><strong>${e(t.nome)}</strong></button><small class="painel-ajuda">${e(t.descricao)}</small>
      <small class="painel-ajuda">${t.executando ? "Executando..." : t.ultimaExecucao ? `Última execução ${e(relativo(t.ultimaExecucao))}, demorando ${duracao(t.duracaoMs)}.${t.resultado ? ` ${resultado[t.resultado]}` : ""}${t.mensagem ? ` · ${e(t.mensagem)}` : ""}` : "Ainda não executada."}</small>
      <small class="painel-ajuda">${t.gatilhosTexto.length ? e(t.gatilhosTexto.join(" · ")) : "Sem gatilhos (só manual)"}${t.proximaExecucao ? ` · próxima ${e(data(t.proximaExecucao))}` : ""}</small></div>
      <button type="button" class="painel-botao pequeno" data-executar="${t.id}" title="Iniciar" ${t.executando ? "disabled" : ""}>▶ Iniciar</button></div>`).join("")}</section>`).join("");
  alvo.querySelectorAll("[data-executar]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true; b.textContent = "Executando...";
    await estado.f.api(`/api/painel/tarefas/${b.dataset.executar}/executar`, { method: "POST", body: "{}" });
    mostrarPagina();
  }));
  alvo.querySelectorAll("[data-abrir-tarefa]").forEach((b) => b.addEventListener("click", () => { estado.tarefaAberta = b.dataset.abrirTarefa; mostrarPagina(); }));
}

async function telaTarefa(alvo, cabecalho, id) {
  const e = estado.f.escapeHtml;
  const { tarefa, intervalos, dias } = await estado.f.api(`/api/painel/tarefas/${id}`);
  const gatilhos = [...tarefa.gatilhos];
  const salvar = async () => {
    const r = await fetch(`/api/painel/tarefas/${id}/gatilhos`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ gatilhos }) });
    const corpo = await r.json();
    if (!r.ok) { estado.f.toast(corpo.error); return; }
    estado.f.toast("Configurações salvas.");
    mostrarPagina();
  };
  alvo.innerHTML = cabecalho(`<button type="button" class="painel-botao" data-voltar-tarefas>Voltar</button>`) + `<section class="painel-cartao" data-detalhe-tarefa="${e(id)}"><h3>${e(tarefa.nome)}</h3><p class="painel-ajuda">${e(tarefa.descricao)}</p>
    <h3>Disparadores de Tarefa</h3>${tarefa.gatilhosTexto.length ? tarefa.gatilhosTexto.map((g, i) => `<div class="painel-pasta" data-gatilho="${i}"><span>${e(g)}</span><button type="button" class="painel-botao pequeno perigo" data-remover-gatilho="${i}">Excluir</button></div>`).join("") : '<p class="painel-vazio">Nenhum disparador: a tarefa só roda manualmente.</p>'}
    <form class="painel-form" data-novo-gatilho><h3>Adicionar Gatilho</h3>
      <label class="painel-campo"><span>Tipo de gatilho</span><select name="tipo"><option value="diario">Diário</option><option value="semanal">Semanal</option><option value="intervalo">Em um intervalo</option><option value="inicializacao">Na inicialização do aplicativo</option></select></label>
      <label class="painel-campo" data-so="semanal"><span>Dia da semana</span><select name="dia">${dias.map((d, i) => `<option value="${i}">${e(d)}</option>`).join("")}</select></label>
      <label class="painel-campo" data-so="diario semanal"><span>Hora</span><input type="time" name="hora" value="03:00"></label>
      <label class="painel-campo" data-so="intervalo"><span>A cada</span><select name="intervaloMs">${intervalos.map((ms) => `<option value="${ms}">${ms >= 3_600_000 ? `${ms / 3_600_000} hora(s)` : `${ms / 60_000} minutos`}</option>`).join("")}</select></label>
      <div class="painel-acoes"><button type="submit" class="painel-botao primario">Adicionar</button></div></form></section>`;
  const form = alvo.querySelector("[data-novo-gatilho]");
  const mostrarCampos = () => form.querySelectorAll("[data-so]").forEach((c) => { c.hidden = !c.dataset.so.split(" ").includes(form.tipo.value); });
  form.tipo.addEventListener("change", mostrarCampos); mostrarCampos();
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const tipo = form.tipo.value;
    gatilhos.push(tipo === "inicializacao" ? { tipo } : tipo === "intervalo" ? { tipo, intervaloMs: Number(form.intervaloMs.value) } : tipo === "diario" ? { tipo, hora: form.hora.value } : { tipo, dia: Number(form.dia.value), hora: form.hora.value });
    salvar();
  });
  alvo.querySelectorAll("[data-remover-gatilho]").forEach((b) => b.addEventListener("click", () => { gatilhos.splice(Number(b.dataset.removerGatilho), 1); salvar(); }));
  alvo.querySelector("[data-voltar-tarefas]").addEventListener("click", () => { estado.tarefaAberta = null; mostrarPagina(); });
}
