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
  const SERVICOS = [
    { nome: "Pugoticine", sigla: "CI", cor: "#C8FF00", url: "https://room.pugotilab.com/" },
    { nome: "Pugotiread", sigla: "RE", cor: "#4F8CFF", url: "https://read.pugotilab.com/" },
    { nome: "Pugotitasks", sigla: "TA", cor: "#2997EB", url: "https://task.pugotilab.com/" },
    { nome: "Pugotimoney", sigla: "MO", cor: "#22C55E", url: "https://finance.pugotilab.com/" },
    { nome: "Pugotilist", sigla: "LI", cor: "#F59E0B", url: "https://list.pugotilab.com/" },
    { nome: "Pugotidice", sigla: "DI", cor: "#EF4444", url: "https://dice.pugotilab.com/" },
    { nome: "Portal", sigla: "LA", cor: "#4FB3FF", url: "https://pugotilab.com/" }
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
  const curto = (nome) => { const t = nome.replace(/^Pugoti/, ""); return t ? t.charAt(0).toUpperCase() + t.slice(1) : nome; };

  const CSS = `
pugoti-conta{display:inline-block;position:relative;flex:none;font-family:inherit;line-height:normal;
  --pc-accent:var(--pa-accent,var(--primary,var(--accent,#4fb3ff)));--pc-border:var(--pa-border,rgba(127,127,127,.32));
  --pc-bg:var(--pa-bg,#11161d);--pc-hover:var(--pa-hover,rgba(127,127,127,.16));--pc-text:var(--pa-text,#eef2f6);--pc-muted:var(--pa-muted,#9aa6b2);--pc-danger:#ff8a80}
html[data-pugoti-tema="claro"] pugoti-conta{--pc-bg:var(--pa-bg-claro,#ffffff);--pc-text:var(--pa-text-claro,#15191e);--pc-muted:var(--pa-muted-claro,#5b6672);--pc-hover:rgba(0,0,0,.06);--pc-border:rgba(0,0,0,.14);--pc-danger:#c62828}
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
pugoti-conta .pc-sigla{position:relative;display:grid;grid-template-columns:1fr 1fr;width:30px;height:30px;padding:4px;border-radius:8px;background:#fff;border:1px solid var(--pc-border);font:900 10px/1 system-ui,sans-serif;text-align:center;align-content:center;gap:1px}
pugoti-conta .pc-sigla b:nth-child(1){color:#141414}pugoti-conta .pc-sigla b:nth-child(2){color:#b4b4b4}pugoti-conta .pc-sigla b:nth-child(4){color:#b4b4b4}
pugoti-conta .pc-tema{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:0 14px 10px;padding:3px;border:1px solid var(--pc-border);border-radius:10px}
pugoti-conta .pc-tema button{display:flex;align-items:center;justify-content:center;gap:5px;min-height:32px;border:0;border-radius:7px;background:transparent;color:var(--pc-text);font:inherit;font-size:12px;cursor:pointer}
pugoti-conta .pc-tema button svg{width:15px;height:15px}
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
  // Antes da conta chegar: último tema usado neste navegador (evita piscar).
  let preferenciaInicial = "sistema";
  try { preferenciaInicial = localStorage.getItem(CHAVE) || "sistema"; } catch {}
  aplicarTema(preferenciaInicial);
  matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
    if ((window.pugotiConta?.preferencia ?? preferenciaInicial) === "sistema") aplicarTema("sistema");
  });

  if (!document.getElementById("pugoti-conta-css")) {
    const estilo = document.createElement("style");
    estilo.id = "pugoti-conta-css";
    estilo.textContent = CSS;
    document.head.append(estilo);
  }

  class PugotiConta extends HTMLElement {
    connectedCallback() {
      this.auth = (this.getAttribute("auth") || "https://pugotilab.com").replace(/\/$/, "");
      this.servico = this.getAttribute("servico") || "";
      this.perfil = null;
      this.preferencia = preferenciaInicial;
      this.aberto = false;
      this.render();
      this.carregar();
      this._fora = (e) => { if (this.aberto && !this.contains(e.target)) this.alternar(false); };
      this._esc = (e) => { if (e.key === "Escape" && this.aberto) { this.alternar(false); this.querySelector(".pc-gatilho")?.focus(); } };
      document.addEventListener("click", this._fora);
      document.addEventListener("keydown", this._esc);
    }
    disconnectedCallback() {
      document.removeEventListener("click", this._fora);
      document.removeEventListener("keydown", this._esc);
    }
    async carregar() {
      try {
        const resposta = await fetch(`${this.auth}/auth/api/session`, { credentials: "include", cache: "no-store" });
        if (!resposta.ok) return;
        this.perfil = (await resposta.json()).profile;
        this.preferencia = this.perfil?.preferences?.theme || "sistema";
        window.pugotiConta = { perfil: this.perfil, preferencia: this.preferencia };
        aplicarTema(this.preferencia);
        document.dispatchEvent(new CustomEvent("pugoti:conta", { detail: this.perfil }));
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
          <nav class="pc-apps" aria-label="Serviços Pugotilab">${SERVICOS.map((s) => `<a class="pc-app" href="${s.url}" ${s.nome === this.servico ? 'aria-current="true"' : ""}><span class="pc-sigla" aria-hidden="true"><b>P</b><b>U</b><b style="color:${s.cor}">${s.sigla[0]}</b><b>${s.sigla[1]}</b></span><span>${esc(curto(s.nome))}</span></a>`).join("")}</nav>
          <div class="pc-secao">Tema</div>
          <div class="pc-tema" role="group" aria-label="Tema">${temas.map(([v, i, t]) => `<button type="button" data-tema="${v}" aria-pressed="${this.preferencia === v}">${icone(i)}<span>${t}</span></button>`).join("")}</div>
          <a class="pc-item pc-sair" role="menuitem" href="${this.auth}/auth/logout?return=${volta}">${icone("logout")}<span>Sair</span></a>
        </div>`;
      this.querySelector(".pc-gatilho").addEventListener("click", (e) => { e.stopPropagation(); this.alternar(); });
      this.querySelectorAll("[data-tema]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); this.salvarTema(b.dataset.tema); }));
    }
  }
  customElements.define("pugoti-conta", PugotiConta);
})();
