/*
 * <pugoti-conta> — menu da conta e Configurações iguais em todos os serviços Pugotilab (PQA-275, PQA-286).
 * Engrenagem (Configurações › Aparência com os 7 Temas Pugotilab), foto e nome, Perfil, atalhos dos serviços e Sair.
 * Lê a conta em https://pugotilab.com/auth/api/session (com o cookie de sessão) e salva o tema em
 * /auth/api/preferences (preferences.palette), a mesma preferência do Pugoti Profile: vale em todos os serviços.
 * Cada serviço carrega a SUA cópia deste arquivo (gerado pelo construir.py; o CSS vem de pugoti-conta.css).
 *
 * Tema: <html data-pugoti-paleta="lima|laranja|brasa|neon|volt|selva|ouro">; o CSS liga as variáveis de cada serviço
 * aos tokens --pt-*. Cada tema é a aparência completa: não há mais claro/escuro (<html data-pugoti-tema="escuro">
 * fica fixo e window.pugotiAplicarTema("escuro") é chamado, para os serviços que tinham modo claro).
 * Eventos: "pugoti:paleta" ({ detail: { paleta, tema } }), "pugoti:tema", "pugoti:conta" ({ detail: perfil }).
 * API: window.pugotiTemas = { lista, atual(), aplicar(id), abrirConfiguracoes() }.
 * Atributos: auth="https://pugotilab.com", servico="Pugoticine", sem-engrenagem (serviço com Configurações próprias:
 * coloca <div data-pugoti-aparencia></div> na tela dele e o seletor de temas é encaixado ali).
 * Ícones: Tabler (outline), embutidos.
 */
(() => {
  if (customElements.get("pugoti-conta")) return;
  const SERVICOS = [
    { nome: "Pugoticine", chave: "cine", url: "https://cine.pugotilab.com/" },
    { nome: "Pugotiread", chave: "read", url: "https://read.pugotilab.com/" },
    { nome: "Pugotitasks", chave: "tasks", url: "https://task.pugotilab.com/" },
    { nome: "Pugotimoney", chave: "money", url: "https://finance.pugotilab.com/" },
    { nome: "Pugotilist", chave: "list", url: "https://list.pugotilab.com/" },
    { nome: "Pugotidice", chave: "dice", url: "https://dice.pugotilab.com/" },
    { nome: "Portal", chave: "portal", url: "https://pugotilab.com/" }
  ];
  // Temas Pugotilab: [fundo, texto, destaque] na ordem definida pelo usuário (tabela única em construir.py).
  const TEMAS = [{"id": "lima", "nome": "Lima", "cores": ["#101010", "#FFFFFF", "#C8FF00"]}, {"id": "laranja", "nome": "Laranja", "cores": ["#101010", "#FFFFFF", "#D97706"]}, {"id": "brasa", "nome": "Brasa", "cores": ["#FF422A", "#FFFFFF", "#000000"]}, {"id": "neon", "nome": "Neon", "cores": ["#000000", "#FFFFFF", "#FF169C"]}, {"id": "volt", "nome": "Volt", "cores": ["#030407", "#1558C9", "#D4FF24"]}, {"id": "selva", "nome": "Selva", "cores": ["#000000", "#6D8F63", "#39FF88"]}, {"id": "ouro", "nome": "Ouro", "cores": ["#08090B", "#F5F3FE", "#FFC900"]}];
  // Serviços que já têm a própria tela de Configurações (o seletor entra nela, em [data-pugoti-aparencia]).
  const SEM_ENGRENAGEM = new Set(["Pugotiread"]);
  const PADRAO = "lima";
  const ICONES = {
    caret: '<path d="M6 9l6 6l6 -6"/>',
    user: '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>',
    settings: '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
    palette: '<path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25"/><path d="M8.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
    check: '<path d="M5 12l5 5l10 -10"/>',
    logout: '<path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"/><path d="M9 12h12l-3 -3"/><path d="M18 15l3 -3"/>'
  };
  const icone = (nome) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome]}</svg>`;
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const CHAVE_PALETA = "pugoti-paleta";
  const AUTH_PADRAO = "https://pugotilab.com";
  let sessaoCompartilhada = null;
  const curto = (nome) => { const t = nome.replace(/^Pugoti/, ""); return t ? t.charAt(0).toUpperCase() + t.slice(1) : nome; };
  const temaPor = (id) => TEMAS.find((t) => t.id === id) ?? TEMAS.find((t) => t.id === PADRAO);

  const CSS = `html[data-pugoti-paleta="lima"]{--pt-fundo:#101010;--pt-texto:#ffffff;--pt-destaque:#c8ff00;--pt-sobre-destaque:#000000;--pt-particula:200,255,0;--pt-brilho:240,255,200}html[data-pugoti-paleta="laranja"]{--pt-fundo:#101010;--pt-texto:#ffffff;--pt-destaque:#d97706;--pt-sobre-destaque:#000000;--pt-particula:217,119,6;--pt-brilho:255,224,180}html[data-pugoti-paleta="brasa"]{--pt-fundo:#ff422a;--pt-texto:#ffffff;--pt-destaque:#000000;--pt-sobre-destaque:#ffffff;--pt-particula:255,255,255;--pt-brilho:255,235,230}html[data-pugoti-paleta="neon"]{--pt-fundo:#000000;--pt-texto:#ffffff;--pt-destaque:#ff169c;--pt-sobre-destaque:#000000;--pt-particula:255,22,156;--pt-brilho:255,200,232}html[data-pugoti-paleta="volt"]{--pt-fundo:#030407;--pt-texto:#1558c9;--pt-destaque:#d4ff24;--pt-sobre-destaque:#000000;--pt-particula:212,255,36;--pt-brilho:240,255,190}html[data-pugoti-paleta="selva"]{--pt-fundo:#000000;--pt-texto:#6d8f63;--pt-destaque:#39ff88;--pt-sobre-destaque:#000000;--pt-particula:57,255,136;--pt-brilho:200,255,220}html[data-pugoti-paleta="ouro"]{--pt-fundo:#08090b;--pt-texto:#f5f3fe;--pt-destaque:#ffc900;--pt-sobre-destaque:#000000;--pt-particula:255,201,0;--pt-brilho:255,240,190}.pc-previa-lima .pc-previa{background:#101010}.pc-previa-lima .pc-previa i{background:#FFFFFF}.pc-previa-lima .pc-previa b{background:#C8FF00;box-shadow:0 0 0 1px #FFFFFF55}.pc-previa-lima .pc-cores span:nth-child(1){background:#101010}.pc-previa-lima .pc-cores span:nth-child(2){background:#FFFFFF}.pc-previa-lima .pc-cores span:nth-child(3){background:#C8FF00}.pc-previa-laranja .pc-previa{background:#101010}.pc-previa-laranja .pc-previa i{background:#FFFFFF}.pc-previa-laranja .pc-previa b{background:#D97706;box-shadow:0 0 0 1px #FFFFFF55}.pc-previa-laranja .pc-cores span:nth-child(1){background:#101010}.pc-previa-laranja .pc-cores span:nth-child(2){background:#FFFFFF}.pc-previa-laranja .pc-cores span:nth-child(3){background:#D97706}.pc-previa-brasa .pc-previa{background:#FF422A}.pc-previa-brasa .pc-previa i{background:#FFFFFF}.pc-previa-brasa .pc-previa b{background:#000000;box-shadow:0 0 0 1px #FFFFFF55}.pc-previa-brasa .pc-cores span:nth-child(1){background:#FF422A}.pc-previa-brasa .pc-cores span:nth-child(2){background:#FFFFFF}.pc-previa-brasa .pc-cores span:nth-child(3){background:#000000}.pc-previa-neon .pc-previa{background:#000000}.pc-previa-neon .pc-previa i{background:#FFFFFF}.pc-previa-neon .pc-previa b{background:#FF169C;box-shadow:0 0 0 1px #FFFFFF55}.pc-previa-neon .pc-cores span:nth-child(1){background:#000000}.pc-previa-neon .pc-cores span:nth-child(2){background:#FFFFFF}.pc-previa-neon .pc-cores span:nth-child(3){background:#FF169C}.pc-previa-volt .pc-previa{background:#030407}.pc-previa-volt .pc-previa i{background:#1558C9}.pc-previa-volt .pc-previa b{background:#D4FF24;box-shadow:0 0 0 1px #1558C955}.pc-previa-volt .pc-cores span:nth-child(1){background:#030407}.pc-previa-volt .pc-cores span:nth-child(2){background:#1558C9}.pc-previa-volt .pc-cores span:nth-child(3){background:#D4FF24}.pc-previa-selva .pc-previa{background:#000000}.pc-previa-selva .pc-previa i{background:#6D8F63}.pc-previa-selva .pc-previa b{background:#39FF88;box-shadow:0 0 0 1px #6D8F6355}.pc-previa-selva .pc-cores span:nth-child(1){background:#000000}.pc-previa-selva .pc-cores span:nth-child(2){background:#6D8F63}.pc-previa-selva .pc-cores span:nth-child(3){background:#39FF88}.pc-previa-ouro .pc-previa{background:#08090B}.pc-previa-ouro .pc-previa i{background:#F5F3FE}.pc-previa-ouro .pc-previa b{background:#FFC900;box-shadow:0 0 0 1px #F5F3FE55}.pc-previa-ouro .pc-cores span:nth-child(1){background:#08090B}.pc-previa-ouro .pc-cores span:nth-child(2){background:#F5F3FE}.pc-previa-ouro .pc-cores span:nth-child(3){background:#FFC900}html[data-pugoti-paleta]{color-scheme:dark;--pt-painel:color-mix(in srgb,var(--pt-texto) 6%,var(--pt-fundo));--pt-painel-2:color-mix(in srgb,var(--pt-texto) 10%,var(--pt-fundo));--pt-painel-3:color-mix(in srgb,var(--pt-texto) 15%,var(--pt-fundo));--pt-borda:color-mix(in srgb,var(--pt-texto) 20%,var(--pt-fundo));--pt-hover:color-mix(in srgb,var(--pt-texto) 10%,transparent);--pt-suave:color-mix(in srgb,var(--pt-texto) 68%,var(--pt-fundo));--pt-destaque-suave:color-mix(in srgb,var(--pt-destaque) 18%,var(--pt-fundo));--pt-destaque-escuro:color-mix(in srgb,var(--pt-destaque) 42%,var(--pt-fundo));--pt-destaque-claro:color-mix(in srgb,var(--pt-destaque) 72%,var(--pt-texto));--pt-destaque-forte:color-mix(in srgb,var(--pt-destaque) 85%,var(--pt-texto))}html[data-pugoti-paleta][data-pugoti-paleta][data-pugoti-paleta],html[data-pugoti-paleta][data-pugoti-paleta][data-pugoti-paleta] body,html[data-pugoti-paleta][data-pugoti-paleta][data-pugoti-paleta] [data-theme]{--bg:var(--pt-fundo);--text:var(--pt-texto);--muted:var(--pt-suave);--panel:var(--pt-painel);--surface:var(--pt-painel);--surface-elevated:var(--pt-painel);--surface-card:var(--pt-painel);--panel2:var(--pt-painel-2);--panel-2:var(--pt-painel-2);--panel-soft:var(--pt-painel-2);--surface-2:var(--pt-painel-2);--surface-soft:var(--pt-painel-2);--surface-menu:var(--pt-painel-2);--surface-card-soft:var(--pt-painel-2);--soft:var(--pt-painel-2);--field:var(--pt-painel-2);--tema-campo:var(--pt-painel-2);--surface-menu-strong:var(--pt-painel-3);--surface-card-strong:var(--pt-painel-3);--line:var(--pt-borda);--border:var(--pt-borda);--input-border:var(--pt-borda);--hover:var(--pt-hover);--brand:var(--pt-destaque);--primary:var(--pt-destaque);--accent:var(--pt-destaque);--blue:var(--pt-destaque);--blue-500:var(--pt-destaque);--blue-600:var(--pt-destaque);--osd-destaque:var(--pt-destaque);--tema-borda-destaque:var(--pt-destaque);--tema-texto-destaque:var(--pt-destaque);--tema-sobre-destaque:var(--pt-sobre-destaque);--brand2:var(--pt-destaque-forte);--brand-2:var(--pt-destaque-forte);--brand-strong:var(--pt-destaque-forte);--primary-hover:var(--pt-destaque-forte);--primary-strong:var(--pt-destaque-forte);--blue-700:var(--pt-destaque-escuro);--brand-soft:var(--pt-destaque-suave);--accent-soft:var(--pt-destaque-suave);--series-hover:var(--pt-destaque-suave);--blue-800:var(--pt-destaque-escuro);--blue-900:var(--pt-destaque-escuro);--tema-selecao:var(--pt-destaque-suave);--icon-strong:var(--pt-texto);--icon-soft:var(--pt-suave);--tema-particula:var(--pt-particula);--tema-brilho:var(--pt-brilho);--pa-accent:var(--pt-destaque);--pa-bg:var(--pt-painel);--pa-text:var(--pt-texto);--pa-muted:var(--pt-suave);--pa-border:var(--pt-borda);--pa-hover:var(--pt-hover)}html[data-pugoti-paleta][data-pugoti-paleta][data-pugoti-paleta] body{background:var(--pt-fundo);color:var(--pt-texto)}html[data-pugoti-paleta] ::selection{background:var(--pt-destaque);color:var(--pt-sobre-destaque)}pugoti-conta{display:inline-flex;align-items:center;gap:4px;position:relative;flex:none;font-family:inherit;line-height:normal;--pc-accent:var(--pt-destaque,#c8ff00);--pc-sobre:var(--pt-sobre-destaque,#000);--pc-border:var(--pt-borda,rgba(127,127,127,.32));--pc-bg:var(--pt-painel,#171717);--pc-hover:var(--pt-hover,rgba(127,127,127,.16));--pc-text:var(--pt-texto,#fff);--pc-muted:var(--pt-suave,#a3a3a3);--pc-danger:#ff8a80}pugoti-conta *{box-sizing:border-box}pugoti-conta svg,.pc-janela svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}pugoti-conta .pc-gatilho{display:flex;align-items:center;gap:6px;height:42px;padding:4px 8px 4px 4px;border:1px solid transparent;border-radius:12px;background:transparent;color:inherit;cursor:pointer;font:inherit}pugoti-conta .pc-engrenagem{display:grid;place-items:center;width:40px;height:40px;border:1px solid transparent;border-radius:12px;background:transparent;color:inherit;cursor:pointer}pugoti-conta .pc-engrenagem svg{width:21px;height:21px}pugoti-conta .pc-gatilho:hover,pugoti-conta .pc-engrenagem:hover,pugoti-conta .pc-item:hover,pugoti-conta .pc-app:hover{background:var(--pc-hover)}pugoti-conta :is(.pc-gatilho,.pc-engrenagem,.pc-item,.pc-app):focus-visible{outline:2px solid var(--pc-accent);outline-offset:2px}pugoti-conta .pc-gatilho>svg{width:14px;height:14px;opacity:.75}pugoti-conta .pc-avatar{position:relative;display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:50%;overflow:hidden;border:1px solid var(--pc-border);background:var(--pc-hover);font-weight:800;font-size:14px;color:var(--pc-text)}pugoti-conta .pc-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}pugoti-conta .pc-menu{position:absolute;top:calc(100% + 7px);right:0;z-index:2147483000;width:292px;max-width:calc(100vw - 24px);border:1px solid var(--pc-border);border-radius:14px;background:var(--pc-bg);color:var(--pc-text);box-shadow:0 18px 48px rgba(0,0,0,.35);overflow:hidden;text-align:left}pugoti-conta .pc-menu[hidden]{display:none}pugoti-conta .pc-resumo{display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;align-items:center;padding:14px;border-bottom:1px solid var(--pc-border)}pugoti-conta .pc-resumo .pc-avatar{width:38px;height:38px}pugoti-conta .pc-resumo strong{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}pugoti-conta .pc-resumo small{display:block;font-size:12px;color:var(--pc-muted)}pugoti-conta .pc-item{display:flex;align-items:center;gap:10px;width:100%;min-height:42px;padding:10px 14px;border:0;background:transparent;color:var(--pc-text);font:inherit;font-size:14px;text-decoration:none;cursor:pointer;text-align:left}pugoti-conta .pc-item small{margin-left:auto;display:inline-flex;align-items:center;gap:6px;color:var(--pc-muted);font-size:12px}pugoti-conta .pc-item.pc-sair{color:var(--pc-danger);border-top:1px solid var(--pc-border)}pugoti-conta .pc-secao{padding:10px 14px 4px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--pc-muted)}pugoti-conta .pc-apps{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:4px 10px 10px}pugoti-conta .pc-app{display:grid;justify-items:center;gap:4px;padding:8px 2px;border-radius:10px;color:var(--pc-text);text-decoration:none;font-size:11px}pugoti-conta .pc-app[aria-current="true"]{background:var(--pc-hover)}pugoti-conta .pc-icone{display:block;width:30px;height:30px;border-radius:8px;border:1px solid var(--pc-border);background:#fff;object-fit:cover}.pc-bolinha{display:inline-block;width:12px;height:12px;border-radius:50%;border:1px solid var(--pt-borda,rgba(127,127,127,.4));background:var(--pt-destaque,#c8ff00)}.pc-janela{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.6);font-family:inherit;line-height:1.4;color:var(--pt-texto,#fff)}.pc-janela[hidden]{display:none}.pc-janela *{box-sizing:border-box}.pc-caixa{display:grid;grid-template-columns:200px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);width:min(860px,100%);max-height:min(680px,calc(100vh - 32px));border:1px solid var(--pt-borda,#333);border-radius:18px;background:var(--pt-fundo,#101010);box-shadow:0 30px 80px rgba(0,0,0,.5);overflow:hidden}.pc-cabecalho{grid-column:1/-1;display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--pt-borda,#333)}.pc-cabecalho h2{margin:0;font-size:18px;font-weight:800;color:var(--pt-texto,#fff)}.pc-fechar{margin-left:auto;display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:10px;background:transparent;color:var(--pt-texto,#fff);cursor:pointer}.pc-fechar:hover{background:var(--pt-hover,rgba(127,127,127,.16))}.pc-abas{display:flex;flex-direction:column;gap:4px;padding:12px;border-right:1px solid var(--pt-borda,#333);background:var(--pt-painel,#171717)}.pc-aba{display:flex;align-items:center;gap:10px;min-height:40px;padding:8px 12px;border:0;border-radius:10px;background:transparent;color:var(--pt-texto,#fff);font:inherit;font-size:14px;text-align:left;text-decoration:none;cursor:pointer}.pc-aba:hover{background:var(--pt-hover,rgba(127,127,127,.16))}.pc-aba[aria-current="page"]{background:var(--pt-destaque,#c8ff00);color:var(--pt-sobre-destaque,#000);font-weight:700}.pc-conteudo{overflow:auto;padding:20px 22px 24px}.pc-aparencia h3{margin:0 0 4px;font-size:16px;font-weight:800;color:var(--pt-texto,#fff)}.pc-aparencia>p{margin:0 0 16px;font-size:13px;color:var(--pt-suave,#a3a3a3)}.pc-temas{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px}.pc-tema-cartao{display:grid;gap:0;padding:0;border:2px solid var(--pt-borda,#333);border-radius:14px;background:var(--pt-painel,#171717);color:var(--pt-texto,#fff);font:inherit;text-align:left;cursor:pointer;overflow:hidden}.pc-tema-cartao:hover{border-color:var(--pt-suave,#777)}.pc-tema-cartao:focus-visible{outline:2px solid var(--pt-destaque,#c8ff00);outline-offset:2px}.pc-tema-cartao[aria-pressed="true"]{border-color:var(--pt-destaque,#c8ff00)}.pc-previa{display:grid;gap:7px;padding:14px 14px 12px;min-height:92px}.pc-previa i{display:block;height:7px;border-radius:4px}.pc-previa i:nth-child(1){width:70%;opacity:.95}.pc-previa i:nth-child(2){width:48%;opacity:.55}.pc-previa b{display:block;width:58px;height:22px;margin-top:4px;border-radius:999px}.pc-tema-rodape{display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid var(--pt-borda,#333)}.pc-tema-rodape strong{font-size:14px}.pc-tema-rodape small{color:var(--pt-suave,#a3a3a3);font-size:12px}.pc-tema-rodape .pc-marcado{margin-left:auto;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--pt-destaque,#c8ff00);color:var(--pt-sobre-destaque,#000)}.pc-tema-rodape .pc-marcado svg{width:14px;height:14px;stroke-width:3}.pc-cores{display:flex;gap:4px;margin-left:auto}.pc-cores span{width:12px;height:12px;border-radius:50%;border:1px solid rgba(127,127,127,.5)}.pc-tema-cartao[aria-pressed="true"] .pc-cores{display:none}@media (max-width:640px){.pc-janela{padding:0;place-items:stretch}.pc-caixa{grid-template-columns:1fr;grid-template-rows:auto auto minmax(0,1fr);width:100%;max-height:none;height:100%;border-radius:0;border:0}.pc-abas{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--pt-borda,#333);padding:8px 12px}.pc-aba{white-space:nowrap}.pc-conteudo{padding:16px}.pc-temas{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}`;

  // Sem claro/escuro: o tema já é a aparência completa. Os serviços que tinham modo claro recebem sempre "escuro".
  function fixarEscuro() {
    document.documentElement.dataset.pugotiTema = "escuro";
    document.documentElement.style.colorScheme = "dark";
    try { window.pugotiAplicarTema?.("escuro", "escuro"); } catch (erro) { console.error(erro); }
    document.dispatchEvent(new CustomEvent("pugoti:tema", { detail: { tema: "escuro", preferencia: "escuro" } }));
  }
  let paletaAtual = PADRAO;
  function aplicarPaleta(valor) {
    const tema = temaPor(valor);
    paletaAtual = tema.id;
    document.documentElement.dataset.pugotiPaleta = tema.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tema.cores[0]);
    try { localStorage.setItem(CHAVE_PALETA, tema.id); } catch {}
    document.dispatchEvent(new CustomEvent("pugoti:paleta", { detail: { paleta: tema.id, tema } }));
    atualizarSeletores();
    return tema.id;
  }
  let paletaInicial = PADRAO;
  try { paletaInicial = temaPor(localStorage.getItem(CHAVE_PALETA)).id; } catch {}
  aplicarPaleta(paletaInicial);
  fixarEscuro();
  // Serviços que ligam o próprio tema depois de carregar: confirma o escuro quando a página termina.
  addEventListener("DOMContentLoaded", fixarEscuro, { once: true });

  // Serviços com CSP sem 'unsafe-inline' em style-src carregam pugoti-conta.css (link com data-pugoti-conta-css).
  if (!document.getElementById("pugoti-conta-css") && !document.querySelector("link[data-pugoti-conta-css]")) {
    const estilo = document.createElement("style");
    estilo.id = "pugoti-conta-css";
    estilo.textContent = CSS;
    document.head.append(estilo);
  }

  function lerSessao(auth) {
    sessaoCompartilhada ||= fetch(`${auth}/auth/api/session`, { credentials: "include", cache: "no-store" })
      .then((resposta) => resposta.ok ? resposta.json() : null).then((corpo) => corpo?.profile ?? null).catch(() => null);
    return sessaoCompartilhada;
  }
  let authDaPagina = AUTH_PADRAO;
  // Primeira resposta da conta na página: tema salvo na conta + evento "pugoti:conta" (uma vez só).
  let contaAplicada = false;
  function aplicarConta(perfil) {
    if (contaAplicada || !perfil) return;
    contaAplicada = true;
    const daConta = window.pugotiConta?.paleta ?? perfil.preferences?.palette;
    if (daConta && daConta !== paletaAtual) paletaAtual = aplicarPaleta(daConta);
    window.pugotiConta = { perfil, preferencia: "escuro", paleta: paletaAtual };
    document.dispatchEvent(new CustomEvent("pugoti:conta", { detail: perfil }));
  }
  async function salvarPaleta(id) {
    const paleta = aplicarPaleta(id);
    paletaAtual = paleta;
    window.pugotiConta = { ...(window.pugotiConta || {}), paleta };
    document.querySelectorAll("pugoti-conta").forEach((m) => m.render?.());
    try {
      const resposta = await fetch(`${authDaPagina}/auth/api/preferences`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { palette: paleta } }) });
      if (!resposta.ok) throw new Error("Preferência não salva");
    } catch { /* fica valendo neste navegador; a conta pode estar offline */ }
  }

  // ---------- seletor de temas (usado na janela e no [data-pugoti-aparencia] dos serviços) ----------
  function htmlSeletor() {
    const cartao = (t, n) => {
      const ativo = t.id === paletaAtual;
      // Cores da prévia por classe (pc-previa-<id>): serviços com CSP sem 'unsafe-inline' recusam style="".
      return `<button type="button" class="pc-tema-cartao pc-previa-${t.id}" data-pc-tema="${t.id}" aria-pressed="${ativo}" aria-label="Tema ${n} ${esc(t.nome)}">
        <span class="pc-previa"><i></i><i></i><b></b></span>
        <span class="pc-tema-rodape"><span><strong>${esc(t.nome)}</strong><br><small>Tema ${n}</small></span>
          ${ativo ? `<span class="pc-marcado">${icone("check")}</span>` : `<span class="pc-cores"><span></span><span></span><span></span></span>`}</span>
      </button>`;
    };
    return `<section class="pc-aparencia" aria-label="Aparência">
      <h3>Tema</h3>
      <p>Vale para todos os serviços Pugotilab nesta conta.</p>
      <div class="pc-temas" role="group" aria-label="Temas Pugotilab">${TEMAS.map((t, i) => cartao(t, i + 1)).join("")}</div>
    </section>`;
  }
  function montarSeletor(lugar) {
    const tinhaFoco = lugar.contains(document.activeElement);
    lugar.innerHTML = htmlSeletor();
    // Redesenhado depois da escolha: o foco volta para o tema marcado (teclado e leitor de tela não se perdem).
    if (tinhaFoco) lugar.querySelector('[aria-pressed="true"]')?.focus();
    lugar.dataset.pcMontado = paletaAtual;
    if (!lugar.dataset.pcLigado) {
      lugar.dataset.pcLigado = "1";
      lugar.addEventListener("click", (e) => {
        const botao = e.target instanceof Element ? e.target.closest("[data-pc-tema]") : null;
        if (botao) { e.preventDefault(); salvarPaleta(botao.dataset.pcTema); }
      });
    }
  }
  function atualizarSeletores() {
    document.querySelectorAll("[data-pugoti-aparencia], .pc-janela [data-pc-aparencia]").forEach((lugar) => {
      if (lugar.dataset.pcMontado !== paletaAtual) montarSeletor(lugar);
    });
  }

  // ---------- janela Configurações ----------
  let janela = null, focoAntes = null;
  function abrirConfiguracoes() {
    focoAntes = document.activeElement;
    if (!janela) {
      janela = document.createElement("div");
      janela.className = "pc-janela";
      janela.setAttribute("role", "dialog");
      janela.setAttribute("aria-modal", "true");
      janela.setAttribute("aria-labelledby", "pc-janela-titulo");
      janela.innerHTML = `<div class="pc-caixa">
        <header class="pc-cabecalho"><h2 id="pc-janela-titulo">Configurações</h2><button type="button" class="pc-fechar" data-pc-fechar aria-label="Fechar">${icone("x")}</button></header>
        <nav class="pc-abas" aria-label="Seções">
          <button type="button" class="pc-aba" aria-current="page">${icone("palette")}<span>Aparência</span></button>
          <a class="pc-aba" data-pc-perfil href="#">${icone("user")}<span>Conta e perfil</span></a>
        </nav>
        <div class="pc-conteudo" data-pc-aparencia></div>
      </div>`;
      janela.addEventListener("click", (e) => {
        if (e.target === janela || (e.target instanceof Element && e.target.closest("[data-pc-fechar]"))) fecharConfiguracoes();
      });
      // Esc fecha de qualquer ponto da página (o foco pode ter ficado fora da janela).
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && janela && !janela.hidden) { e.stopPropagation(); fecharConfiguracoes(); } }, true);
      document.body.append(janela);
    }
    janela.querySelector("[data-pc-perfil]").href = `${authDaPagina}/auth/profile?return=${encodeURIComponent(location.href)}`;
    montarSeletor(janela.querySelector("[data-pc-aparencia]"));
    janela.hidden = false;
    janela.querySelector('[aria-pressed="true"]')?.focus();
  }
  function fecharConfiguracoes() {
    if (!janela || janela.hidden) return;
    janela.hidden = true;
    focoAntes?.focus?.();
  }

  class PugotiConta extends HTMLElement {
    connectedCallback() {
      // Serviços que redesenham a tela movem o MESMO elemento para o lugar novo: não refaz nada, só religa os eventos.
      if (this._iniciado) { this.ligarDocumento(); return; }
      this._iniciado = true;
      this.auth = (this.getAttribute("auth") || AUTH_PADRAO).replace(/\/$/, "");
      authDaPagina = this.auth;
      this.servico = this.getAttribute("servico") || "";
      if (this.servico) document.documentElement.dataset.pugotiServico = this.servico;
      this.perfil = null;
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
        const perfil = await lerSessao(this.auth);
        if (!perfil || !this.isConnected) return;
        this.perfil = perfil;
        aplicarConta(perfil);
        this.render();
      } catch { /* sem conta: o menu mostra só os botões */ }
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
      const tema = temaPor(paletaAtual);
      const engrenagem = this.hasAttribute("sem-engrenagem") || SEM_ENGRENAGEM.has(this.servico) ? ""
        : `<button class="pc-engrenagem" type="button" data-pc-configuracoes title="Configurações" aria-label="Configurações">${icone("settings")}</button>`;
      this.innerHTML = `${engrenagem}
        <button class="pc-gatilho" type="button" aria-haspopup="menu" aria-expanded="${this.aberto}" title="Menu da conta" aria-label="Menu da conta de ${esc(nome)}">${this.avatar()}${icone("caret")}</button>
        <div class="pc-menu" role="menu" ${this.aberto ? "" : "hidden"}>
          <div class="pc-resumo">${this.avatar()}<div><strong>${esc(nome)}</strong><small>${p ? `@${esc(p.username)}${p.role === "admin" ? " · Administrador" : ""}` : "Entre para ver sua conta"}</small></div></div>
          <a class="pc-item" role="menuitem" href="${this.auth}/auth/profile?return=${volta}">${icone("user")}<span>Perfil</span></a>
          <button class="pc-item" type="button" role="menuitem" data-pc-configuracoes>${icone("palette")}<span>Aparência</span><small><span class="pc-bolinha"></span>${esc(tema.nome)}</small></button>
          <div class="pc-secao">Serviços</div>
          <nav class="pc-apps" aria-label="Serviços Pugotilab">${SERVICOS.map((s) => `<a class="pc-app" href="${s.url}" ${s.nome === this.servico ? 'aria-current="true"' : ""}><img class="pc-icone" src="${this.auth}/auth/assets/servicos/${s.chave}.png" alt="" loading="lazy"><span>${esc(curto(s.nome))}</span></a>`).join("")}</nav>
          <a class="pc-item pc-sair" role="menuitem" href="${this.auth}/auth/logout?return=${volta}">${icone("logout")}<span>Sair</span></a>
        </div>`;
      this.querySelector(".pc-gatilho").addEventListener("click", (e) => { e.stopPropagation(); this.alternar(); });
      this.querySelectorAll("[data-pc-configuracoes]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); this.alternar(false); abrirConfiguracoes(); }));
    }
  }
  customElements.define("pugoti-conta", PugotiConta);

  // Páginas sem o menu (o Perfil, no próprio auth): o tema da conta é aplicado do mesmo jeito.
  async function sincronizarSemMenu() {
    if (document.querySelector("pugoti-conta")) return;
    aplicarConta(await lerSessao(authDaPagina));
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", sincronizarSemMenu, { once: true });
  else sincronizarSemMenu();

  window.pugotiTemas = { lista: TEMAS.map((t) => ({ ...t })), atual: () => paletaAtual, aplicar: salvarPaleta, abrirConfiguracoes, fecharConfiguracoes };

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
      if (lugar.hasAttribute("data-sem-engrenagem")) contaPersistente.setAttribute("sem-engrenagem", "");
    }
    lugar.replaceWith(contaPersistente);
  };
  // Automático: quando o serviço redesenha e deixa o lugar marcado, o mesmo menu é encaixado logo em seguida; o seletor
  // de temas é montado em cada [data-pugoti-aparencia] novo (Configurações do próprio serviço).
  const observar = () => new MutationObserver(() => {
    const lugar = document.querySelector("[data-pugoti-conta]");
    if (lugar) window.pugotiEncaixarConta(lugar.getAttribute("data-pugoti-conta") || undefined);
    document.querySelectorAll("[data-pugoti-aparencia]:not([data-pc-montado])").forEach(montarSeletor);
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) observar();
})();
