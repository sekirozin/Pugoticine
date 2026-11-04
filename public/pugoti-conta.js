/*
 * <pugoti-conta> — menu da conta igual em todos os serviços Pugotilab (PQA-275).
 * Foto e nome, Perfil (Pugoti Profile), atalhos para os outros serviços, tema (Sistema/Claro/Escuro) e Sair.
 * Lê a conta em https://pugotilab.com/auth/api/session (com o cookie de sessão) e salva o tema em
 * /auth/api/preferences, a mesma preferência do Pugoti Profile. Cada serviço carrega a SUA cópia deste arquivo.
 *
 * Tema: o componente marca <html data-pugoti-tema="claro|escuro"> (e color-scheme), dispara o evento
 * "pugoti:tema" ({ detail: { tema, preferencia } }) e chama window.pugotiAplicarTema(tema) se o serviço definir.
 * Conta: evento "pugoti:conta" ({ detail: perfil }) e window.pugotiConta.perfil (inclui preferences de legenda/áudio).
 * Atributos: auth="https://pugotilab.com" (endereço do auth), servico="Pugoticine" (destaca o serviço atual).
 * Ícones: Tabler (outline), embutidos.
 */
(() => {
  if (customElements.get("pugoti-conta")) return;
  // Ícones oficiais (PU + sigla), servidos pelo auth em /auth/assets/servicos/<chave>.png.
  const SERVICOS = [
    { nome: "Pugoticine", chave: "cine", url: "https://cine.pugotilab.com/" },
    { nome: "Pugotiread", chave: "read", url: "https://read.pugotilab.com/" },
    { nome: "Pugotitasks", chave: "tasks", url: "https://task.pugotilab.com/" },
    { nome: "Pugotimoney", chave: "money", url: "https://finance.pugotilab.com/" },
    { nome: "Pugotilist", chave: "list", url: "https://list.pugotilab.com/" },
    { nome: "Pugotidice", chave: "dice", url: "https://dice.pugotilab.com/" },
    { nome: "Portal", chave: "portal", url: "https://pugotilab.com/" }
  ];
  const ICONES = {
    caret: '<path d="M6 9l6 6l6 -6"/>',
    user: '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>',
    grid: '<path d="M4 4h6v6h-6z"/><path d="M14 4h6v6h-6z"/><path d="M4 14h6v6h-6z"/><path d="M14 14h6v6h-6z"/>',
    sun: '<path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
    moon: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>',
    device: '<path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10z"/><path d="M7 20h10"/><path d="M9 16v4"/><path d="M15 16v4"/>',
    logout: '<path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"/><path d="M9 12h12l-3 -3"/><path d="M18 15l3 -3"/>'
  };
  const icone = (nome) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome]}</svg>`;
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const CHAVE = "pugoti-tema";
  const CHAVE_PALETA = "pugoti-paleta";
  let sessaoCompartilhada = null;
  const curto = (nome) => { const t = nome.replace(/^Pugoti/, ""); return t ? t.charAt(0).toUpperCase() + t.slice(1) : nome; };

  const CSS = `
html[data-pugoti-paleta="lima"][data-pugoti-tema]{--pa-accent:#c8ff00;--primary:#c8ff00;--brand:#c8ff00;--brand2:#dcff5c;--blue:#c8ff00;--accent:#c8ff00}
html[data-pugoti-paleta="laranja"][data-pugoti-tema]{--pa-accent:#d97706;--primary:#d97706;--brand:#d97706;--brand2:#f59e0b;--blue:#d97706;--accent:#d97706}
html[data-pugoti-tema="escuro"][data-pugoti-paleta]{--bg:#101010;--text:#fff;--panel:#171717;--panel2:#242424;--line:#393939;--soft:#242424}
html[data-pugoti-tema="escuro"][data-pugoti-paleta] body{background:#101010;color:#fff}
pugoti-conta{display:inline-block;position:relative;flex:none;font-family:inherit;line-height:normal;
  --pc-accent:var(--pa-accent,var(--primary,var(--accent,#4fb3ff)));--pc-border:var(--pa-border,rgba(127,127,127,.32));
  --pc-bg:var(--pa-bg,#11161d);--pc-hover:var(--pa-hover,rgba(127,127,127,.16));--pc-text:var(--pa-text,#eef2f6);--pc-muted:var(--pa-muted,#9aa6b2);--pc-danger:#ff8a80}
html[data-pugoti-tema="claro"] pugoti-conta:not([so-escuro]){--pc-bg:var(--pa-bg-claro,#ffffff);--pc-text:var(--pa-text-claro,#15191e);--pc-muted:var(--pa-muted-claro,#5b6672);--pc-hover:rgba(0,0,0,.06);--pc-border:rgba(0,0,0,.14);--pc-danger:#c62828}
pugoti-conta *{box-sizing:border-box}
pugoti-conta svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
pugoti-conta .pc-gatilho{display:flex;align-items:center;gap:6px;height:42px;padding:4px 8px 4px 4px;border:1px solid transparent;border-radius:12px;background:transparent;color:inherit;cursor:pointer;font:inherit}
pugoti-conta .pc-gatilho:hover,pugoti-conta .pc-item:hover,pugoti-conta .pc-app:hover{background:var(--pc-hover)}
pugoti-conta .pc-gatilho:focus-visible,pugoti-conta .pc-item:focus-visible,pugoti-conta .pc-app:focus-visible,pugoti-conta .pc-tema button:focus-visible{outline:2px solid var(--pc-accent);outline-offset:2px}
pugoti-conta .pc-gatilho>svg{width:14px;height:14px;opacity:.75}
pugoti-conta .pc-avatar{position:relative;display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:50%;overflow:hidden;border:1px solid var(--pc-border);background:var(--pc-hover);font-weight:800;font-size:14px;color:var(--pc-text)}
pugoti-conta .pc-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
pugoti-conta .pc-menu{position:absolute;top:calc(100% + 7px);right:0;z-index:2147483000;width:292px;max-width:calc(100vw - 24px);border:1px solid var(--pc-border);border-radius:14px;background:var(--pc-bg);color:var(--pc-text);box-shadow:0 18px 48px rgba(0,0,0,.35);overflow:hidden;text-align:left}
pugoti-conta .pc-menu[hidden]{display:none}
pugoti-conta .pc-resumo{display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;align-items:center;padding:14px;border-bottom:1px solid var(--pc-border)}
pugoti-conta .pc-resumo .pc-avatar{width:38px;height:38px}
pugoti-conta .pc-resumo strong{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
pugoti-conta .pc-resumo small{display:block;font-size:12px;color:var(--pc-muted)}
pugoti-conta .pc-item{display:flex;align-items:center;gap:10px;width:100%;min-height:42px;padding:10px 14px;border:0;background:transparent;color:var(--pc-text);font:inherit;font-size:14px;text-decoration:none;cursor:pointer}
pugoti-conta .pc-item.pc-sair{color:var(--pc-danger);border-top:1px solid var(--pc-border)}
pugoti-conta .pc-secao{padding:10px 14px 4px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--pc-muted)}
pugoti-conta .pc-apps{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:4px 10px 10px}
pugoti-conta .pc-app{display:grid;justify-items:center;gap:4px;padding:8px 2px;border-radius:10px;color:var(--pc-text);text-decoration:none;font-size:11px}
pugoti-conta .pc-app[aria-current="true"]{background:var(--pc-hover)}
pugoti-conta .pc-icone{display:block;width:30px;height:30px;border-radius:8px;border:1px solid var(--pc-border);background:#fff;object-fit:cover}
pugoti-conta .pc-amostra{width:13px;height:13px;border-radius:50%;border:1px solid currentColor}
pugoti-conta .pc-paletas{grid-template-columns:repeat(2,1fr)}
pugoti-conta .pc-amostra-lima{background:#c8ff00}
pugoti-conta .pc-amostra-laranja{background:#d97706}
pugoti-conta .pc-tema{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:0 14px 10px;padding:3px;border:1px solid var(--pc-border);border-radius:10px}
pugoti-conta .pc-tema button{display:flex;align-items:center;justify-content:center;gap:5px;min-height:32px;border:0;border-radius:7px;background:transparent;color:var(--pc-text);font:inherit;font-size:12px;cursor:pointer}
pugoti-conta .pc-tema button svg{width:15px;height:15px}
pugoti-conta .pc-nota{margin:-4px 14px 10px;font-size:11px;color:var(--pc-muted)}
pugoti-conta .pc-tema button[aria-pressed="true"]{background:var(--pc-accent);color:#0b0f14;font-weight:700}
`;

  function temaResolvido(preferencia) {
    if (preferencia === "claro" || preferencia === "escuro") return preferencia;
    return matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro";
  }
  function aplicarTema(preferencia) {
    const tema = temaResolvido(preferencia);
    document.documentElement.dataset.pugotiTema = tema;
    document.documentElement.style.colorScheme = tema === "claro" ? "light" : "dark";
    try { localStorage.setItem(CHAVE, preferencia); } catch {}
    try { window.pugotiAplicarTema?.(tema, preferencia); } catch (erro) { console.error(erro); }
    document.dispatchEvent(new CustomEvent("pugoti:tema", { detail: { tema, preferencia } }));
  }
  function aplicarPaleta(valor) {
    const paleta = valor === "laranja" ? "laranja" : "lima";
    document.documentElement.dataset.pugotiPaleta = paleta;
    try { localStorage.setItem(CHAVE_PALETA, paleta); } catch {}
    document.dispatchEvent(new CustomEvent("pugoti:paleta", { detail: { paleta } }));
  }
  let paletaInicial = "lima";
  try { paletaInicial = localStorage.getItem(CHAVE_PALETA) || "lima"; } catch {}
  aplicarPaleta(paletaInicial);
  // Antes da conta chegar: último tema usado neste navegador (evita piscar).
  let preferenciaInicial = "sistema";
  try { preferenciaInicial = localStorage.getItem(CHAVE) || "sistema"; } catch {}
  aplicarTema(preferenciaInicial);
  matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
    if ((window.pugotiConta?.preferencia ?? preferenciaInicial) === "sistema") aplicarTema("sistema");
  });

  // Serviços com CSP sem 'unsafe-inline' em style-src carregam pugoti-conta.css (link com data-pugoti-conta-css).
  if (!document.getElementById("pugoti-conta-css") && !document.querySelector("link[data-pugoti-conta-css]")) {
    const estilo = document.createElement("style");
    estilo.id = "pugoti-conta-css";
    estilo.textContent = CSS;
    document.head.append(estilo);
  }

  class PugotiConta extends HTMLElement {
    connectedCallback() {
      // Serviços que redesenham a tela movem o MESMO elemento para o lugar novo: não refaz nada, só religa os eventos.
      if (this._iniciado) { this.ligarDocumento(); return; }
      this._iniciado = true;
      this.auth = (this.getAttribute("auth") || "https://pugotilab.com").replace(/\/$/, "");
      this.servico = this.getAttribute("servico") || "";
      this.perfil = null;
      this.preferencia = preferenciaInicial;
      this.paleta = paletaInicial;
      this.aberto = false;
      this.render();
      this.carregar();
      this._fora = (e) => { if (this.aberto && !this.contains(e.target)) this.alternar(false); };
      this._esc = (e) => { if (e.key === "Escape" && this.aberto) { this.alternar(false); this.querySelector(".pc-gatilho")?.focus(); } };
      this.ligarDocumento();
    }
    ligarDocumento() {
      document.addEventListener("click", this._fora);
      document.addEventListener("keydown", this._esc);
    }
    disconnectedCallback() {
      document.removeEventListener("click", this._fora);
      document.removeEventListener("keydown", this._esc);
    }
    async carregar() {
      try {
        // Uma consulta por página: serviços que redesenham o cabeçalho recriam o menu várias vezes.
        const primeira = !sessaoCompartilhada;
        sessaoCompartilhada ||= fetch(`${this.auth}/auth/api/session`, { credentials: "include", cache: "no-store" })
          .then((resposta) => resposta.ok ? resposta.json() : null).then((corpo) => corpo?.profile ?? null).catch(() => null);
        const perfil = await sessaoCompartilhada;
        if (!perfil || !this.isConnected) return;
        this.perfil = perfil;
        this.preferencia = window.pugotiConta?.preferencia ?? perfil.preferences?.theme ?? "sistema";
        this.paleta = window.pugotiConta?.paleta ?? perfil.preferences?.palette ?? "lima";
        window.pugotiConta = { perfil, preferencia: this.preferencia, paleta: this.paleta };
        if (primeira) {
          aplicarTema(this.preferencia);
          aplicarPaleta(this.paleta);
          document.dispatchEvent(new CustomEvent("pugoti:conta", { detail: perfil }));
        }
        this.render();
      } catch { /* sem conta: o menu mostra só o botão */ }
    }
    async salvarTema(preferencia) {
      this.preferencia = preferencia;
      window.pugotiConta = { ...(window.pugotiConta || {}), preferencia };
      aplicarTema(preferencia);
      this.render();
      try {
        await fetch(`${this.auth}/auth/api/preferences`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { theme: preferencia } }) });
      } catch { /* fica valendo neste navegador */ }
    }
    async salvarPaleta(paleta) {
      this.paleta = paleta === "laranja" ? "laranja" : "lima";
      window.pugotiConta = { ...(window.pugotiConta || {}), paleta: this.paleta };
      aplicarPaleta(this.paleta);
      this.render();
      try {
        const resposta = await fetch(`${this.auth}/auth/api/preferences`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { palette: this.paleta } }) });
        if (!resposta.ok) throw new Error("Preferência não salva");
      } catch { /* permanece aplicada neste navegador; a conta pode estar offline */ }
    }
    alternar(abrir = !this.aberto) {
      this.aberto = abrir;
      this.querySelector(".pc-menu").hidden = !abrir;
      this.querySelector(".pc-gatilho").setAttribute("aria-expanded", String(abrir));
    }
    avatar() {
      const p = this.perfil;
      const nome = p?.nickname || p?.displayName || p?.username || "";
      return `<span class="pc-avatar">${p?.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : esc((nome || "?").slice(0, 1).toUpperCase())}</span>`;
    }
    render() {
      const p = this.perfil;
      const nome = p?.nickname || p?.displayName || p?.username || "Conta Pugotilab";
      const volta = encodeURIComponent(location.href);
      const temas = [["sistema", "device", "Sistema"], ["claro", "sun", "Claro"], ["escuro", "moon", "Escuro"]];
      this.innerHTML = `
        <button class="pc-gatilho" type="button" aria-haspopup="menu" aria-expanded="${this.aberto}" title="Menu da conta" aria-label="Menu da conta de ${esc(nome)}">${this.avatar()}${icone("caret")}</button>
        <div class="pc-menu" role="menu" ${this.aberto ? "" : "hidden"}>
          <div class="pc-resumo">${this.avatar()}<div><strong>${esc(nome)}</strong><small>${p ? `@${esc(p.username)}${p.role === "admin" ? " · Administrador" : ""}` : "Entre para ver sua conta"}</small></div></div>
          <a class="pc-item" role="menuitem" href="${this.auth}/auth/profile?return=${volta}">${icone("user")}<span>Perfil</span></a>
          <div class="pc-secao">Serviços</div>
          <nav class="pc-apps" aria-label="Serviços Pugotilab">${SERVICOS.map((s) => `<a class="pc-app" href="${s.url}" ${s.nome === this.servico ? 'aria-current="true"' : ""}><img class="pc-icone" src="${this.auth}/auth/assets/servicos/${s.chave}.png" alt="" loading="lazy"><span>${esc(curto(s.nome))}</span></a>`).join("")}</nav>
          <div class="pc-secao">Tema PugotiLab</div>
          <div class="pc-tema pc-paletas" role="group" aria-label="Tema PugotiLab">
            <button type="button" data-paleta="lima" aria-pressed="${this.paleta === "lima"}"><span class="pc-amostra pc-amostra-lima"></span>Lima</button>
            <button type="button" data-paleta="laranja" aria-pressed="${this.paleta === "laranja"}"><span class="pc-amostra pc-amostra-laranja"></span>Laranja</button>
          </div>
          <div class="pc-secao">Aparência</div>
          <div class="pc-tema" role="group" aria-label="Tema">${temas.map(([v, i, t]) => `<button type="button" data-tema="${v}" aria-pressed="${this.preferencia === v}">${icone(i)}<span>${t}</span></button>`).join("")}</div>
          ${this.hasAttribute("so-escuro") ? `<p class="pc-nota">O ${esc(this.servico || "serviço")} usa só o tema escuro; a escolha vale para os outros serviços.</p>` : ""}
          <a class="pc-item pc-sair" role="menuitem" href="${this.auth}/auth/logout?return=${volta}">${icone("logout")}<span>Sair</span></a>
        </div>`;
      this.querySelector(".pc-gatilho").addEventListener("click", (e) => { e.stopPropagation(); this.alternar(); });
      this.querySelectorAll("[data-paleta]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); this.salvarPaleta(b.dataset.paleta); }));
      this.querySelectorAll("[data-tema]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); this.salvarTema(b.dataset.tema); }));
    }
  }
  customElements.define("pugoti-conta", PugotiConta);

  /**
   * Para serviços que redesenham a tela com innerHTML: o HTML deixa <span data-pugoti-conta></span> e, depois de cada
   * render, o serviço chama pugotiEncaixarConta("Nome do serviço"). O mesmo menu é movido para o lugar novo (não fecha
   * nem consulta o auth de novo).
   */
  let contaPersistente = null;
  window.pugotiEncaixarConta = (servico) => {
    const lugar = document.querySelector("[data-pugoti-conta]");
    if (!lugar) return;
    if (!contaPersistente) {
      contaPersistente = document.createElement("pugoti-conta");
      if (servico) contaPersistente.setAttribute("servico", servico);
      if (lugar.hasAttribute("data-so-escuro")) contaPersistente.setAttribute("so-escuro", "");
    }
    lugar.replaceWith(contaPersistente);
  };
  // Automático: quando o serviço redesenha e deixa o lugar marcado, o mesmo menu é encaixado logo em seguida.
  const observar = () => new MutationObserver(() => {
    const lugar = document.querySelector("[data-pugoti-conta]");
    if (lugar) window.pugotiEncaixarConta(lugar.getAttribute("data-pugoti-conta") || undefined);
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) observar();
})();
