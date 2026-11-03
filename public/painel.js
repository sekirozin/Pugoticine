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
        linha("Memória livre", `${bytes(s.memoriaLivre)} de ${bytes(s.memoriaTotal)}`), linha("Memória do PugotiCine", bytes(s.memoriaProcesso)),
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
