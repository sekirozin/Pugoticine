// Catálogo no estilo dos serviços de streaming: destaque grande no topo, fileiras que rolam para o lado, cartões que
// crescem ao passar o mouse e janela de detalhes. Desempenho: imagens WebP no tamanho certo (srcset) e só quando
// aparecem (loading=lazy), fileiras fora da tela não são desenhadas (content-visibility), um único ouvinte de clique.
// Os botões de reproduzir mantêm data-play (o app e as Salas abrem o player por ele).
const ICONE_PLAY = '<svg class="icone-cheio" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const ICONE_INFO = '<svg class="icone-cheio" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>';
const ICONE_FECHAR = '<svg class="icone-cheio" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
const SETA = (lado) => `<svg class="icone-cheio" viewBox="0 0 24 24" aria-hidden="true"><path d="${lado === "esquerda" ? "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" : "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"}"/></svg>`;

let ctx = null;
let destaqueDaSessao = null;
const escapar = (texto) => ctx.escapeHtml(String(texto ?? ""));

function imagem(item, tipo, larguras, sizes, classe, prioridade = false) {
  const base = item.imagens?.[tipo];
  if (!base) return "";
  const url = (l) => `${base}&l=${l}`;
  return `<img class="${classe}" src="${url(larguras[Math.min(1, larguras.length - 1)])}" srcset="${larguras.map((l) => `${url(l)} ${l}w`).join(", ")}" sizes="${sizes}" alt="" ${prioridade ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}
function duracaoTexto(minutos) {
  if (!minutos) return "";
  const h = Math.floor(minutos / 60), m = Math.round(minutos % 60);
  return h ? `${h} h ${m ? `${m} min` : ""}`.trim() : `${m} min`;
}
function restante(progresso) {
  const segundos = Math.max(0, (progresso.duration || 0) - (progresso.position || 0));
  const minutos = Math.round(segundos / 60);
  return minutos >= 60 ? `Faltam ${Math.floor(minutos / 60)} h ${minutos % 60} min` : `Faltam ${Math.max(1, minutos)} min`;
}
function emAndamento(item) {
  const p = ctx.progressFor(item.id);
  return p.position > 30 && !p.completed;
}
function percentual(item) {
  const p = ctx.progressFor(item.id);
  return p.duration ? Math.min(100, (p.position / p.duration) * 100) : 0;
}
function metaLinha(item) {
  const m = item.metadata || {};
  return [item.year, duracaoTexto(m.runtime), m.certification].filter(Boolean).map((v) => `<span>${escapar(v)}</span>`).join("");
}

// ---------- cartões ----------
function cartao(item, formato = "poster") {
  const nome = item.year ? `${item.title} (${item.year})` : item.title;
  const largo = formato === "largo";
  const p = ctx.progressFor(item.id);
  const andamento = largo && emAndamento(item);
  return `<article class="titulo titulo-${formato}" role="listitem">
    <button type="button" class="titulo-capa" data-detalhes="${item.id}" aria-label="${escapar(nome)}: mais informações">
      ${largo ? imagem(item, "fundo", [780, 1280], "(max-width: 700px) 70vw, 340px", "titulo-img") : imagem(item, "poster", [185, 342, 500], "(max-width: 700px) 40vw, 180px", "titulo-img")}
      <span class="titulo-nome-reserva">${escapar(item.title)}</span>
      ${andamento ? `<span class="titulo-progresso"><span style="width:${percentual(item).toFixed(1)}%"></span></span>` : ""}
    </button>
    <div class="titulo-painel">
      <button type="button" class="titulo-play" data-play="${item.id}" title="${andamento ? "Continuar" : "Assistir"}">${ICONE_PLAY}<span class="visualmente-oculto">${andamento ? "Continuar" : "Assistir"} ${escapar(item.title)}</span></button>
      <button type="button" class="titulo-info" data-detalhes="${item.id}" title="Mais informações" aria-label="Mais informações sobre ${escapar(item.title)}">${ICONE_INFO}</button>
      <span class="titulo-meta"><strong>${escapar(item.title)}</strong>${andamento ? `<em>${escapar(restante(p))}</em>` : `<em>${[item.year, duracaoTexto(item.metadata?.runtime)].filter(Boolean).join(" · ")}</em>`}</span>
    </div>
  </article>`;
}

function fileira(titulo, itens, formato = "poster") {
  if (!itens.length) return "";
  return `<section class="fileira fileira-${formato}" aria-label="${escapar(titulo)}">
    <h2>${escapar(titulo)}</h2>
    <div class="fileira-trilho">
      <button type="button" class="fileira-seta fileira-seta-esquerda" data-rolar="-1" aria-label="Anteriores de ${escapar(titulo)}" hidden>${SETA("esquerda")}</button>
      <div class="fileira-lista" role="list">${itens.map((item) => cartao(item, formato)).join("")}</div>
      <button type="button" class="fileira-seta fileira-seta-direita" data-rolar="1" aria-label="Próximos de ${escapar(titulo)}">${SETA("direita")}</button>
    </div>
  </section>`;
}

// ---------- destaque ----------
function escolherDestaque(media) {
  if (destaqueDaSessao && media.some((m) => m.id === destaqueDaSessao)) return media.find((m) => m.id === destaqueDaSessao);
  // Um dos adicionados recentemente (com sinopse, se houver), fixo durante a sessão.
  const candidatos = [...media].sort((a, b) => (b.modifiedAt || "").localeCompare(a.modifiedAt || "")).slice(0, 8);
  const comSinopse = candidatos.filter((m) => m.metadata?.overview);
  const lista = comSinopse.length ? comSinopse : candidatos;
  const escolhido = lista[Math.floor(Math.random() * lista.length)];
  destaqueDaSessao = escolhido?.id ?? null;
  return escolhido;
}
function destaque(item) {
  if (!item) return "";
  const andamento = emAndamento(item);
  const m = item.metadata || {};
  return `<section class="destaque" aria-label="Destaque: ${escapar(item.title)}">
    ${imagem(item, "fundo", [780, 1280, 1920], "100vw", "destaque-fundo", true)}
    <div class="destaque-sombra"></div>
    <div class="destaque-info">
      <h1>${escapar(item.title)}</h1>
      <p class="destaque-meta">${metaLinha(item)}${m.audienceScore ? `<span class="destaque-nota">${m.audienceScore}% do público</span>` : ""}</p>
      ${m.overview ? `<p class="destaque-sinopse">${escapar(m.overview)}</p>` : ""}
      <div class="destaque-botoes">
        <button type="button" class="botao-assistir" data-play="${item.id}">${ICONE_PLAY}<span>${andamento ? "Continuar" : "Assistir"}</span></button>
        <button type="button" class="botao-info" data-detalhes="${item.id}">${ICONE_INFO}<span>Mais informações</span></button>
      </div>
      ${andamento ? `<div class="destaque-progresso"><span style="width:${percentual(item).toFixed(1)}%"></span></div><p class="destaque-restante">${escapar(restante(ctx.progressFor(item.id)))}</p>` : ""}
    </div>
  </section>`;
}

// ---------- telas ----------
function telaInicio(media) {
  const continuar = media.filter(emAndamento).sort((a, b) => (ctx.progressFor(b.id).updatedAt || "").localeCompare(ctx.progressFor(a.id).updatedAt || ""));
  const recentes = [...media].sort((a, b) => (b.modifiedAt || "").localeCompare(a.modifiedAt || "")).slice(0, 20);
  const generos = new Map();
  for (const item of media) for (const g of item.metadata?.genres ?? []) generos.set(g, [...(generos.get(g) ?? []), item]);
  const porGenero = [...generos.entries()].filter(([, itens]) => itens.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const todos = [...media].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  return destaque(escolherDestaque(media))
    + `<div class="fileiras">`
    + fileira("Continuar assistindo", continuar, "largo")
    + fileira("Adicionados recentemente", recentes)
    + porGenero.map(([g, itens]) => fileira(g, itens)).join("")
    + fileira("Todos os filmes", todos)
    + `</div>`;
}
function grade(titulo, subtitulo, itens, formato = "poster", filtros = "") {
  return `<section class="catalogo">
    <div class="catalogo-cabecalho"><div><h1>${escapar(titulo)}</h1>${subtitulo ? `<p>${escapar(subtitulo)}</p>` : ""}</div>${filtros}</div>
    ${itens.length ? `<div class="grade grade-${formato}" role="list">${itens.map((i) => cartao(i, formato)).join("")}</div>` : `<div class="vazio">Nada encontrado.</div>`}
  </section>`;
}
function telaFilmes(media) {
  const generos = [...new Set(media.flatMap((m) => m.metadata?.genres ?? []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const { genero = "", ordem = "titulo" } = ctx.filtros ?? {};
  let itens = genero ? media.filter((m) => m.metadata?.genres?.includes(genero)) : [...media];
  itens.sort(ordem === "recentes" ? (a, b) => (b.modifiedAt || "").localeCompare(a.modifiedAt || "")
    : ordem === "ano" ? (a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title, "pt-BR")
      : (a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const filtros = `<div class="catalogo-filtros">
    ${generos.length ? `<label><span class="visualmente-oculto">Gênero</span><select data-filtro="genero"><option value="">Todos os gêneros</option>${generos.map((g) => `<option${g === genero ? " selected" : ""}>${escapar(g)}</option>`).join("")}</select></label>` : ""}
    <label><span class="visualmente-oculto">Ordenar</span><select data-filtro="ordem">
      <option value="titulo"${ordem === "titulo" ? " selected" : ""}>Título (A–Z)</option>
      <option value="recentes"${ordem === "recentes" ? " selected" : ""}>Adicionados recentemente</option>
      <option value="ano"${ordem === "ano" ? " selected" : ""}>Ano de lançamento</option></select></label>
  </div>`;
  return grade("Filmes", `${itens.length} ${itens.length === 1 ? "título" : "títulos"}`, itens, "poster", filtros);
}

// ---------- janela de detalhes ----------
function fecharDetalhes() {
  const janela = document.querySelector(".detalhes");
  if (!janela) return;
  janela.remove();
  document.body.classList.remove("detalhes-aberto");
  ctx?.focoAnterior?.focus?.();
}
export function abrirDetalhes(id) {
  const item = ctx.media.find((m) => m.id === id);
  if (!item) return;
  fecharDetalhes();
  ctx.focoAnterior = document.activeElement;
  const m = item.metadata || {};
  const andamento = emAndamento(item);
  const parecidos = ctx.media.filter((x) => x.id !== item.id && (x.metadata?.genres ?? []).some((g) => (m.genres ?? []).includes(g))).slice(0, 12);
  const extras = parecidos.length ? parecidos : ctx.media.filter((x) => x.id !== item.id).slice(0, 12);
  const linha = (rotulo, valor) => valor ? `<p><span>${rotulo}:</span> ${escapar(valor)}</p>` : "";
  document.body.insertAdjacentHTML("beforeend", `<div class="detalhes" role="dialog" aria-modal="true" aria-label="${escapar(item.title)}">
    <div class="detalhes-caixa">
      <button type="button" class="detalhes-fechar" data-fechar-detalhes aria-label="Fechar">${ICONE_FECHAR}</button>
      <div class="detalhes-topo">
        ${imagem(item, "fundo", [780, 1280], "(max-width: 900px) 100vw, 900px", "detalhes-fundo", true)}
        <div class="detalhes-topo-sombra"></div>
        <div class="detalhes-topo-info">
          <h2>${escapar(item.title)}</h2>
          <div class="destaque-botoes">
            <button type="button" class="botao-assistir" data-play="${item.id}">${ICONE_PLAY}<span>${andamento ? "Continuar" : "Assistir"}</span><span class="visualmente-oculto"> ${escapar(item.title)}</span></button>
          </div>
          ${andamento ? `<div class="destaque-progresso"><span style="width:${percentual(item).toFixed(1)}%"></span></div><p class="destaque-restante">${escapar(restante(ctx.progressFor(item.id)))}</p>` : ""}
        </div>
      </div>
      <div class="detalhes-corpo">
        <div class="detalhes-principal">
          <p class="destaque-meta">${metaLinha(item)}</p>
          <p class="detalhes-sinopse">${escapar(m.overview || "Sem sinopse disponível.")}</p>
        </div>
        <div class="detalhes-lateral">
          ${linha("Gêneros", (m.genres ?? []).join(", "))}
          ${linha("Título original", m.originalTitle && m.originalTitle !== item.title ? m.originalTitle : "")}
          ${linha("Estúdio", m.studio)}
          ${linha("Público", m.audienceScore ? `${m.audienceScore}%` : "")}
          ${linha("Crítica", m.criticScore ? `${m.criticScore}%${m.criticSource ? ` (${m.criticSource})` : ""}` : "")}
        </div>
      </div>
      ${extras.length ? `<div class="detalhes-parecidos"><h3>${parecidos.length ? "Títulos parecidos" : "Mais títulos"}</h3><div class="grade grade-poster" role="list">${extras.map((x) => cartao(x)).join("")}</div></div>` : ""}
    </div>
  </div>`);
  document.body.classList.add("detalhes-aberto");
  document.querySelector(".detalhes [data-play]")?.focus();
}

// ---------- API usada pelo app.js ----------
/**
 * @param {HTMLElement} conteudo
 * @param {{ media: any[], view: string, query: string, progressFor: Function, abrirPlayer: Function, escapeHtml: Function }} contexto
 */
export function renderCatalogo(conteudo, contexto) {
  ctx = { ...ctx, ...contexto };
  const { media, view, query } = ctx;
  const busca = query.trim().toLocaleLowerCase("pt-BR");
  let html;
  if (busca) {
    const itens = media.filter((m) => `${m.title} ${m.year || ""} ${m.metadata?.originalTitle || ""} ${(m.metadata?.genres ?? []).join(" ")}`.toLocaleLowerCase("pt-BR").includes(busca));
    html = grade(`Resultados para “${query.trim()}”`, `${itens.length} ${itens.length === 1 ? "resultado" : "resultados"}`, itens);
  }
  else if (view === "continue") html = grade("Continuar assistindo", "Retome de onde parou.", media.filter(emAndamento), "largo");
  else if (view === "movies") html = telaFilmes(media);
  else html = media.length ? telaInicio(media) : `<div class="vazio">Nenhum filme na biblioteca ainda.</div>`;
  conteudo.innerHTML = html;
  document.body.classList.toggle("tem-destaque", Boolean(!busca && view === "home" && media.length));
  atualizarSetas(conteudo);
  ligar(conteudo);
}

function atualizarSetas(raiz) {
  raiz.querySelectorAll(".fileira-trilho").forEach((trilho) => {
    const lista = trilho.querySelector(".fileira-lista");
    const fim = lista.scrollWidth - lista.clientWidth - 4;
    trilho.querySelector(".fileira-seta-esquerda").hidden = lista.scrollLeft <= 4;
    trilho.querySelector(".fileira-seta-direita").hidden = lista.scrollLeft >= fim;
  });
}

let ligado = false;
function ligar(conteudo) {
  if (ligado) return;
  ligado = true;
  // Um ouvinte só (delegação) para todo o catálogo e a janela de detalhes.
  document.addEventListener("click", (evento) => {
    const alvo = evento.target instanceof Element ? evento.target : null;
    if (!alvo) return;
    const play = alvo.closest("[data-play]");
    if (play && (conteudo.contains(play) || play.closest(".detalhes"))) {
      evento.preventDefault();
      fecharDetalhes();
      ctx.abrirPlayer(play.dataset.play);
      return;
    }
    const detalhes = alvo.closest("[data-detalhes]");
    if (detalhes && (conteudo.contains(detalhes) || detalhes.closest(".detalhes"))) { evento.preventDefault(); abrirDetalhes(detalhes.dataset.detalhes); return; }
    if (alvo.closest("[data-fechar-detalhes]") || alvo.classList.contains("detalhes")) { fecharDetalhes(); return; }
    const seta = alvo.closest("[data-rolar]");
    if (seta) {
      const lista = seta.parentElement.querySelector(".fileira-lista");
      lista.scrollBy({ left: Number(seta.dataset.rolar) * lista.clientWidth * 0.9, behavior: "smooth" });
    }
  });
  conteudo.addEventListener("scroll", (evento) => { if (evento.target.classList?.contains("fileira-lista")) atualizarSetas(conteudo); }, true);
  conteudo.addEventListener("change", (evento) => {
    const filtro = evento.target.closest?.("[data-filtro]");
    if (!filtro) return;
    ctx.filtros = { ...(ctx.filtros ?? {}), [filtro.dataset.filtro]: filtro.value };
    renderCatalogo(conteudo, {});
  });
  document.addEventListener("keydown", (evento) => { if (evento.key === "Escape" && document.querySelector(".detalhes")) { evento.stopPropagation(); fecharDetalhes(); } }, true);
  // Imagem carregada: aparece suavemente (sem "piscar" o texto reserva).
  document.addEventListener("load", (evento) => { if (evento.target instanceof HTMLImageElement) evento.target.classList.add("carregada"); }, true);
  // Barra superior transparente sobre o destaque até rolar (como nos serviços de streaming).
  addEventListener("scroll", () => document.body.classList.toggle("rolou", scrollY > 40), { passive: true });
  addEventListener("resize", () => atualizarSetas(conteudo), { passive: true });
}
