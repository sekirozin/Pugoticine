// Salas de filme sincronizadas (cliente). Inspirado no SyncPlay do jellyfin-web (src/plugins/syncPlay):
//  - TimeSync: pings ao relógio do servidor; a diferença de relógio vem da medição com menor atraso;
//  - comandos agendados: "tocar" chega com o instante combinado ("quando", no relógio do servidor);
//  - correção de deriva (PlaybackCore): diferença de 60 ms a 3 s → ajusta a velocidade por 1 s (SpeedToSync);
//    acima disso → pula para a posição do grupo (SkipToSync);
//  - ações da pessoa no player (play, pause, pular, travou carregando) viram comandos para a sala.
// Controla o <video id="player"> por fora e usa window.pugoticine (app.js) para abrir/fechar o player.
(() => {
  "use strict";
  const $ = (s, raiz = document) => raiz.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  const ROTULO = { publica: "Pública", senha: "Com senha", privada: "Privada" };
  const MIN_VELOCIDADE_MS = 60, MAX_VELOCIDADE_MS = 3000, DURACAO_VELOCIDADE_MS = 1000;

  async function api(url, opcoes = {}) {
    const r = await fetch(url, { ...opcoes, headers: { "content-type": "application/json", ...(opcoes.headers || {}) } });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.error || `Erro ${r.status}`);
    return dados;
  }

  // ---------- TimeSync ----------
  const relogio = {
    medidas: [], diferenca: 0, ping: 0,
    async medir() {
      const t0 = Date.now();
      const { agora } = await api("/api/salas/tempo");
      const t1 = Date.now();
      this.medidas.push({ diferenca: agora - (t0 + t1) / 2, atraso: t1 - t0 });
      if (this.medidas.length > 8) this.medidas.shift();
      const melhor = this.medidas.reduce((a, b) => (b.atraso < a.atraso ? b : a));
      this.diferenca = melhor.diferenca;
      this.ping = melhor.atraso / 2;
    },
    servidorAgora() { return Date.now() + this.diferenca; },
    localDe(instanteServidor) { return instanteServidor - this.diferenca; }
  };

  // ---------- sincronização com o player ----------
  const sala = {
    atual: null, eventos: null, assistindo: false, ultimaVersao: 0, reproducao: null,
    ignorarAte: { play: 0, pause: 0, seek: 0, waiting: 0 }, abrindo: false, prontoEnviado: 0,
    corrigindoAte: 0, inicioAgendado: null, tempoPing: null, carregandoAvisado: false, status: "",
    // Registro curto (últimos 60 eventos) para diagnóstico: window.pugoticineSalas.sala.registro.
    registro: [],
    anotar(texto) { const v = this.video(); this.registro.push(`${new Date().toISOString().slice(11, 23)} t=${v ? v.currentTime.toFixed(2) : "-"} ${texto}`); if (this.registro.length > 60) this.registro.shift(); },

    video() { return document.getElementById("player"); },
    ignorar(tipo, ms = 800) { this.ignorarAte[tipo] = Date.now() + ms; },
    ignorando(tipo) { return this.abrindo || Date.now() < this.ignorarAte[tipo]; },
    async comando(tipo, extra = {}) {
      if (!this.atual) return;
      if (tipo !== "ping") this.anotar(`envia ${tipo} ${JSON.stringify(extra)}`);
      try { await api(`/api/salas/${this.atual.id}/comandos`, { method: "POST", body: JSON.stringify({ tipo, ...extra }) }); }
      catch (e) { aviso(e.message); }
    },

    async conectar(salaInfo) {
      this.sair(false);
      this.atual = salaInfo;
      this.ultimaVersao = 0;
      for (let i = 0; i < 3; i++) await relogio.medir().catch(() => {});
      this.eventos = new EventSource(`/api/salas/${salaInfo.id}/eventos`);
      this.eventos.addEventListener("sala", (e) => this.receber(JSON.parse(e.data)));
      this.eventos.addEventListener("encerrada", () => { aviso("A sala foi encerrada."); this.sair(); });
      this.tempoPing = setInterval(async () => {
        await relogio.medir().catch(() => {});
        this.comando("ping", { ping: Math.round(relogio.ping) });
      }, 5000);
      this.comando("ping", { ping: Math.round(relogio.ping) });
      indicador();
      renderizar();
    },
    sair(atualizarTela = true) {
      this.eventos?.close();
      clearInterval(this.tempoPing);
      clearTimeout(this.inicioAgendado);
      this.eventos = null; this.atual = null; this.assistindo = false; this.reproducao = null;
      const v = this.video();
      if (v) v.playbackRate = 1;
      $("#sala-barra")?.remove();
      indicador();
      if (atualizarTela) renderizar();
    },
    receber(info) {
      this.atual = info;
      renderizar();
      if (info.reproducao.versao > this.ultimaVersao) {
        this.ultimaVersao = info.reproducao.versao;
        this.reproducao = info.reproducao;
        this.anotar(`recebe v${info.reproducao.versao} ${info.reproducao.estado} pos=${info.reproducao.posicao.toFixed(2)}`);
        this.prontoEnviado = 0;
        this.aplicar().catch((e) => console.error("Sala:", e));
      }
      this.barra();
    },
    async assistir() {
      this.assistindo = true;
      $("#salas-painel").hidden = true;
      await this.aplicar();
    },
    posicaoDoGrupo() {
      const r = this.reproducao;
      if (!r) return 0;
      return r.estado === "tocando" ? r.posicao + (relogio.servidorAgora() - r.quando) / 1000 : r.posicao;
    },
    pular(v, posicao) {
      this.ignorar("seek"); this.ignorar("waiting", 2500);
      v.currentTime = Math.max(0, posicao);
    },
    async aplicar() {
      const r = this.reproducao;
      if (!r || !this.assistindo || !r.mediaId) return;
      const pc = window.pugoticine;
      if (pc.midiaAberta() !== r.mediaId) {
        this.abrindo = true;
        await pc.abrirPlayer(r.mediaId);
        const v = this.video();
        await new Promise((ok) => (v.readyState >= 1 ? ok() : v.addEventListener("loadedmetadata", ok, { once: true })));
        // O player retoma do progresso pessoal ("continuar de onde parou"); na sala manda a posição do grupo. Espera esse
        // salto do próprio player assentar e só então aplica o estado da sala (que leva cada um ao ponto do grupo).
        await new Promise((ok) => setTimeout(ok, 1200));
        this.abrindo = false;
        this.anotar("player aberto; aplicando a posição da sala");
        if (this.reproducao !== r) return this.aplicar(); // chegou estado novo enquanto abria
      }
      const v = this.video();
      clearTimeout(this.inicioAgendado);
      v.playbackRate = 1;
      if (r.estado === "pausado" || r.estado === "parado" || r.estado === "aguardando") {
        if (!v.paused) { this.ignorar("pause"); v.pause(); }
        if (Math.abs(v.currentTime - r.posicao) > 0.3) this.pular(v, r.posicao);
        if (r.estado === "aguardando") this.avisarQuandoPronto(r.versao);
        return;
      }
      // tocando: começa no instante combinado, na posição do grupo.
      const faltaMs = relogio.localDe(r.quando) - Date.now();
      if (faltaMs > 0) {
        if (!v.paused) { this.ignorar("pause"); v.pause(); }
        if (Math.abs(v.currentTime - r.posicao) > 0.3) this.pular(v, r.posicao);
        this.inicioAgendado = setTimeout(() => this.tocarAgora(), faltaMs);
      }
      else this.tocarAgora();
    },
    tocarAgora() {
      const v = this.video();
      const alvo = this.posicaoDoGrupo();
      if (Math.abs(v.currentTime - alvo) > 0.4) this.pular(v, alvo);
      if (v.paused) { this.ignorar("play"); v.play().catch(() => aviso("Toque no vídeo para liberar a reprodução.")); }
    },
    avisarQuandoPronto(versao) {
      const v = this.video();
      const conferir = () => {
        if (!this.reproducao || this.reproducao.versao !== versao || this.prontoEnviado === versao) return;
        if (v.readyState >= 3 && !v.seeking) { this.prontoEnviado = versao; this.carregandoAvisado = false; this.comando("pronto"); }
        else setTimeout(conferir, 150);
      };
      conferir();
    },
    // Correção de deriva (PlaybackCore.syncPlaybackTime): só enquanto o grupo toca.
    corrigir() {
      const r = this.reproducao, v = this.video();
      if (!this.assistindo || !r || r.estado !== "tocando" || !v || v.paused || v.seeking || this.abrindo) return;
      if (relogio.localDe(r.quando) > Date.now() || Date.now() < this.corrigindoAte) return;
      const diferencaMs = (this.posicaoDoGrupo() - v.currentTime) * 1000;
      const absoluta = Math.abs(diferencaMs);
      if (absoluta >= MIN_VELOCIDADE_MS && absoluta < MAX_VELOCIDADE_MS) {
        v.playbackRate = Math.min(2, Math.max(0.2, 1 + diferencaMs / DURACAO_VELOCIDADE_MS));
        this.status = `ajustando velocidade (×${v.playbackRate.toFixed(2)})`;
        this.corrigindoAte = Date.now() + DURACAO_VELOCIDADE_MS;
        setTimeout(() => { v.playbackRate = 1; this.status = "sincronizado"; this.barra(); }, DURACAO_VELOCIDADE_MS);
      }
      else if (absoluta >= MAX_VELOCIDADE_MS) {
        this.pular(v, this.posicaoDoGrupo());
        this.status = "pulando para o ponto do grupo";
        this.corrigindoAte = Date.now() + 1500;
      }
      else this.status = "sincronizado";
      this.barra();
    },
    barra() {
      const modal = document.getElementById("player-modal");
      if (!this.atual || !this.assistindo || !modal || modal.hidden) { $("#sala-barra")?.remove(); return; }
      let barra = $("#sala-barra");
      if (!barra) {
        barra = document.createElement("div");
        barra.id = "sala-barra";
        barra.className = "sala-barra";
        // Espaço reservado pelo player em tela cheia (#player-acoes-topo); sem ele, o topo do player.
        const lugar = document.getElementById("player-acoes-topo");
        if (lugar) lugar.append(barra); else (modal.querySelector(".player-shell") || modal).prepend(barra);
      }
      const membros = this.atual.membros.map((m) => `<span class="sala-pessoa${m.carregando ? " carregando" : ""}" title="${esc(m.carregando ? "carregando" : "pronto")}">${esc(m.nome)}</span>`).join("");
      const estado = { tocando: "tocando", pausado: "pausado", aguardando: "esperando todos carregarem", parado: "parado" }[this.reproducao?.estado] || "";
      barra.innerHTML = `<strong>Sala: ${esc(this.atual.nome)}</strong><span class="sala-estado" data-sala-estado>${esc(estado)}${this.status && this.reproducao?.estado === "tocando" ? ` · ${esc(this.status)}` : ""}</span><span class="sala-pessoas">${membros}</span>`;
    }
  };

  // Ações da pessoa no player viram comandos (o que o próprio módulo faz é ignorado por uma janela curta).
  function ligarPlayer() {
    const v = sala.video();
    if (!v || v.dataset.salasLigado) return;
    v.dataset.salasLigado = "1";
    for (const evento of ["play", "pause", "seeking", "seeked", "waiting", "canplay"]) v.addEventListener(evento, () => sala.atual && sala.anotar(`evento ${evento}${sala.ignorando(evento === "seeking" || evento === "seeked" ? "seek" : evento === "canplay" ? "waiting" : evento) ? " (ignorado)" : ""}`));
    v.addEventListener("play", () => { if (sala.atual && sala.assistindo && !sala.ignorando("play")) sala.comando("tocar", { posicao: v.currentTime }); });
    v.addEventListener("pause", () => { if (sala.atual && sala.assistindo && !v.ended && !sala.ignorando("pause")) sala.comando("pausar", { posicao: v.currentTime }); });
    v.addEventListener("seeked", () => { if (sala.atual && sala.assistindo && !sala.ignorando("seek")) sala.comando("pular", { posicao: v.currentTime }); });
    v.addEventListener("waiting", () => {
      if (sala.atual && sala.assistindo && sala.reproducao?.estado === "tocando" && !sala.ignorando("waiting") && !sala.carregandoAvisado) {
        sala.carregandoAvisado = true;
        sala.comando("carregando");
      }
    });
    v.addEventListener("canplay", () => { if (sala.carregandoAvisado && sala.reproducao?.estado === "aguardando") sala.avisarQuandoPronto(sala.reproducao.versao); });
    setInterval(() => sala.corrigir(), 500);
    // Fechar o player sai do modo "assistindo" (continua na sala).
    document.getElementById("player-close")?.addEventListener("click", () => { sala.assistindo = false; sala.barra(); renderizar(); }, true);
  }

  // Ícone aceso enquanto a pessoa está numa sala (como o SyncPlay ativo no cabeçalho do Jellyfin).
  function indicador() {
    const botao = document.getElementById("salas-abrir");
    if (!botao) return;
    botao.classList.toggle("ativo", Boolean(sala.atual));
    const texto = sala.atual ? `Salas de Filmes — você está em "${sala.atual.nome}"` : "Salas de Filmes";
    botao.title = texto;
    botao.setAttribute("aria-label", texto);
  }

  // ---------- telas ----------
  let lista = [];
  function aviso(texto) {
    const t = document.getElementById("toast");
    if (!t) return alert(texto);
    t.textContent = texto; t.hidden = false;
    clearTimeout(aviso.tempo); aviso.tempo = setTimeout(() => { t.hidden = true; }, 3500);
  }
  function tituloDe(mediaId) {
    return window.pugoticine?.midias().find((m) => m.id === mediaId)?.title || "Nenhum filme escolhido";
  }
  function opcoesFilmes(selecionado) {
    return `<option value="">Escolher depois</option>${(window.pugoticine?.midias() || []).map((m) => `<option value="${esc(m.id)}"${m.id === selecionado ? " selected" : ""}>${esc(m.title)}${m.year ? ` (${m.year})` : ""}</option>`).join("")}`;
  }
  async function carregar() {
    try { lista = (await api("/api/salas")).salas; } catch (e) { aviso(e.message); }
    renderizar();
  }
  function renderizar() {
    const painel = $("#salas-painel");
    if (!painel || painel.hidden) return;
    const corpo = $("#salas-corpo");
    if (sala.atual) {
      const s = sala.atual;
      const link = s.codigoConvite ? `${location.origin}/?sala=${s.id}&convite=${s.codigoConvite}` : "";
      corpo.innerHTML = `
        <div class="sala-atual" data-sala-atual="${esc(s.id)}">
          <div class="sala-cabecalho"><div><span class="sala-tipo sala-tipo-${s.tipo}">${ROTULO[s.tipo]}</span><h3>${esc(s.nome)}</h3>
            <p>Dono: @${esc(s.dono)} · ${s.controle === "dono" ? "só o dono controla" : "todos controlam"}</p></div>
            <button class="sala-botao secundario" data-sala-sair>Sair da sala</button></div>
          <label>Filme<select data-sala-filme ${s.controle === "dono" && !s.souDono ? "disabled" : ""}>${opcoesFilmes(s.reproducao.mediaId)}</select></label>
          <button class="sala-botao" data-sala-assistir ${s.reproducao.mediaId ? "" : "disabled"}>Assistir com a sala</button>
          <h4>Na sala agora (${s.membros.length})</h4>
          <div class="sala-pessoas">${s.membros.map((m) => `<span class="sala-pessoa">${esc(m.nome)}</span>`).join("") || "<em>Ninguém conectado</em>"}</div>
          ${s.souDono ? `<h4>Convidar pessoas do PugotiLab</h4>
            <form class="sala-linha" data-sala-convidar><input name="usuarios" placeholder="usuários, separados por vírgula" required><button class="sala-botao">Convidar</button></form>
            <p class="sala-ajuda">Convidados: ${s.convidados.length ? s.convidados.map((u) => `@${esc(u)}`).join(", ") : "ninguém ainda"}</p>
            <p class="sala-ajuda">Link de convite: <input readonly value="${esc(link)}" data-sala-link></p>
            <button class="sala-botao perigo" data-sala-excluir>Encerrar sala</button>` : ""}
        </div>`;
      return;
    }
    corpo.innerHTML = `
      <form class="sala-criar" data-sala-criar>
        <h3>Criar sala</h3>
        <input name="nome" placeholder="Nome da sala" maxlength="80" required>
        <div class="sala-linha">
          <select name="tipo" data-sala-tipo><option value="publica">Pública (aparece para todos)</option><option value="senha">Com senha</option><option value="privada">Privada (só convidados)</option></select>
          <select name="controle"><option value="todos">Todos controlam</option><option value="dono">Só eu controlo</option></select>
        </div>
        <input name="senha" type="password" placeholder="Senha da sala" minlength="4" hidden data-sala-senha>
        <input name="convidados" placeholder="Convidar usuários (separados por vírgula)">
        <select name="mediaId">${opcoesFilmes("")}</select>
        <button class="sala-botao">Criar sala</button>
      </form>
      <h3>Salas</h3>
      <div class="sala-lista">${lista.map((s) => `
        <article class="sala-cartao" data-sala-id="${esc(s.id)}">
          <div><span class="sala-tipo sala-tipo-${s.tipo}">${ROTULO[s.tipo]}</span>${s.convidado ? '<span class="sala-tipo">Convite</span>' : ""}
            <strong>${esc(s.nome)}</strong><small>@${esc(s.dono)} · ${s.membros.length} na sala · ${esc(tituloDe(s.reproducao.mediaId))}</small></div>
          ${s.tipo === "senha" && !s.tenhoAcesso ? '<input type="password" placeholder="Senha" data-sala-senha-entrada>' : ""}
          <button class="sala-botao" data-sala-entrar>Entrar</button>
        </article>`).join("") || '<p class="sala-ajuda">Nenhuma sala ainda. Crie a primeira!</p>'}</div>`;
  }

  async function entrar(id, credenciais = {}) {
    const { sala: info } = await api(`/api/salas/${id}/entrar`, { method: "POST", body: JSON.stringify(credenciais) });
    await sala.conectar(info);
  }

  function montar() {
    if ($("#salas-painel")) return;
    // Como o SyncPlay do jellyfin-web (scripts/libraryMenu.js:49): botão com o ícone "groups" no cabeçalho, à direita,
    // antes da busca e do perfil — não no menu lateral.
    const topo = document.querySelector(".topbar");
    const botao = document.createElement("button");
    botao.className = "icon-button salas-topo"; botao.id = "salas-abrir"; botao.type = "button";
    botao.title = "Salas de Filmes"; botao.setAttribute("aria-label", "Salas de Filmes");
    botao.innerHTML = '<svg class="salas-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58C.48 14.9 0 15.62 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85-.85-.37-1.79-.58-2.78-.58-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/></svg>';
    const busca = topo?.querySelector(".search");
    if (busca) topo.insertBefore(botao, busca);
    else topo?.insertBefore(botao, topo.querySelector("#profile-button"));
    const painel = document.createElement("section");
    painel.id = "salas-painel"; painel.className = "salas-painel"; painel.hidden = true;
    painel.innerHTML = '<div class="salas-caixa"><div class="sala-cabecalho"><h2>Salas de filme</h2><button class="sala-botao secundario" data-salas-fechar>Fechar</button></div><div id="salas-corpo"></div></div>';
    document.body.append(painel);
    botao.addEventListener("click", () => { painel.hidden = false; if (sala.atual) renderizar(); else carregar(); });
    painel.addEventListener("click", async (e) => {
      const alvo = e.target;
      if (!(alvo instanceof Element)) return;
      try {
        if (alvo.closest("[data-salas-fechar]") || alvo === painel) { painel.hidden = true; return; }
        if (alvo.closest("[data-sala-entrar]")) {
          const cartao = alvo.closest("[data-sala-id]");
          await entrar(cartao.dataset.salaId, { senha: $("[data-sala-senha-entrada]", cartao)?.value });
          return;
        }
        if (alvo.closest("[data-sala-sair]")) { sala.sair(); carregar(); return; }
        if (alvo.closest("[data-sala-assistir]")) { await sala.assistir(); return; }
        if (alvo.closest("[data-sala-excluir]") && confirm("Encerrar a sala para todos?")) {
          await api(`/api/salas/${sala.atual.id}`, { method: "DELETE" }); sala.sair(); carregar(); return;
        }
        if (alvo.closest("[data-sala-link]")) { alvo.select(); navigator.clipboard?.writeText(alvo.value).then(() => aviso("Link copiado.")).catch(() => {}); }
      }
      catch (erro) { aviso(erro.message); }
    });
    painel.addEventListener("change", async (e) => {
      if (e.target.matches("[data-sala-tipo]")) { const senha = $("[data-sala-senha]", painel); senha.hidden = e.target.value !== "senha"; senha.required = e.target.value === "senha"; }
      if (e.target.matches("[data-sala-filme]") && e.target.value) await sala.comando("filme", { mediaId: e.target.value });
    });
    painel.addEventListener("submit", async (e) => {
      e.preventDefault();
      const dados = Object.fromEntries(new FormData(e.target));
      try {
        if (e.target.matches("[data-sala-criar]")) {
          const { sala: info } = await api("/api/salas", { method: "POST", body: JSON.stringify({ ...dados, convidados: String(dados.convidados || "").split(",") }) });
          await sala.conectar(info);
        }
        if (e.target.matches("[data-sala-convidar]")) {
          await api(`/api/salas/${sala.atual.id}/convidar`, { method: "POST", body: JSON.stringify({ usuarios: String(dados.usuarios).split(",") }) });
          aviso("Convite enviado.");
        }
      }
      catch (erro) { aviso(erro.message); }
    });
    ligarPlayer();
  }

  // Link de convite: /?sala=<id>&convite=<código> (ou só ?sala=<id> para salas públicas).
  async function abrirPeloLink() {
    const p = new URLSearchParams(location.search);
    const id = p.get("sala");
    if (!id) return;
    history.replaceState(null, "", location.pathname);
    try {
      await entrar(id, { convite: p.get("convite") || undefined });
      $("#salas-painel").hidden = false;
      renderizar();
    }
    catch (erro) { aviso(erro.message); }
  }

  window.pugoticineSalas = { sala, relogio };
  window.addEventListener("pugoticine:pronto", () => { montar(); abrirPeloLink(); }, { once: true });
  if (window.pugoticine?.midias?.().length) { montar(); abrirPeloLink(); }
})();
