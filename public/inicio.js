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

// ---------- filmes e séries (como Movie / Series › Season › Episode do Jellyfin) ----------
const porData = (a, b) => (b.modifiedAt || "").localeCompare(a.modifiedAt || "");
const porTitulo = (a, b) => a.title.localeCompare(b.title, "pt-BR");
const ordemEpisodio = (a, b) => a.serie.temporada - b.serie.temporada || a.serie.episodio - b.serie.episodio || a.title.localeCompare(b.title, "pt-BR");
function montarEntradas(media) {
  const series = new Map();
  const entradas = [];
  for (const item of media) {
    if (!item.serie) { entradas.push(item); continue; }
    let s = series.get(item.serie.id);
    if (!s) {
      s = { id: item.serie.id, ehSerie: true, title: item.serie.nome, year: null, metadata: {}, bibliotecaId: item.bibliotecaId, bibliotecaNome: item.bibliotecaNome, episodios: [], modifiedAt: "" };
      series.set(s.id, s); entradas.push(s);
    }
    s.episodios.push(item);
    if ((item.modifiedAt || "") > s.modifiedAt) s.modifiedAt = item.modifiedAt;
  }
  for (const s of series.values()) {
    s.episodios.sort(ordemEpisodio);
    s.temporadas = [...new Set(s.episodios.map((e) => e.serie.temporada))].sort((a, b) => a - b);
    s.imagens = s.episodios[0].imagens;
  }
  return { entradas, series };
}
const concluido = (item) => ctx.progressFor(item.id).completed;
/** Próximo episódio: o que está em andamento (o mais recente); senão o seguinte ao último assistido; senão o primeiro. */
function proximoEpisodio(serie) {
  const andamento = serie.episodios.filter(emAndamento).sort((a, b) => (ctx.progressFor(b.id).updatedAt || "").localeCompare(ctx.progressFor(a.id).updatedAt || ""));
  if (andamento.length) return andamento[0];
  let ultimo = -1;
  serie.episodios.forEach((e, i) => { if (concluido(e)) ultimo = i; });
  return serie.episodios.slice(ultimo + 1).find((e) => !concluido(e)) ?? serie.episodios[0];
}
/** "A seguir" (Next Up do Jellyfin): séries já começadas, com o próximo episódio ainda não iniciado. */
function aSeguir(series) {
  const lista = [];
  for (const s of series.values()) {
    const assistidos = s.episodios.filter(concluido);
    if (!assistidos.length) continue;
    const proximo = proximoEpisodio(s);
    if (proximo && !concluido(proximo) && !emAndamento(proximo)) lista.push([proximo, assistidos.map((e) => ctx.progressFor(e.id).updatedAt || "").sort().pop()]);
  }
  return lista.sort((a, b) => b[1].localeCompare(a[1])).map(([e]) => e);
}
const rotuloEpisodio = (e) => `T${e.serie.temporada}E${String(e.serie.episodio).padStart(2, "0")}${e.serie.episodioFinal ? `-E${String(e.serie.episodioFinal).padStart(2, "0")}` : ""}`;
const nomeEpisodio = (e) => e.serie.nomeEpisodio || `Episódio ${e.serie.episodio}`;
const playDe = (entrada) => entrada.ehSerie ? proximoEpisodio(entrada) : entrada;
function contagemSerie(s) {
  const t = s.temporadas.length, e = s.episodios.length;
  return `${t} ${t === 1 ? "temporada" : "temporadas"} · ${e} ${e === 1 ? "episódio" : "episódios"}`;
}

// ---------- cartões ----------
function cartao(item, formato = "poster") {
  const nome = item.year ? `${item.title} (${item.year})` : item.title;
  const largo = formato === "largo";
  const alvo = playDe(item);
  const p = ctx.progressFor(alvo.id);
  const andamento = (largo || item.ehSerie) && emAndamento(alvo);
  const detalhesId = item.serie ? item.serie.id : item.id;
  const sub = item.ehSerie ? (andamento ? `${rotuloEpisodio(alvo)} · ${restante(p)}` : contagemSerie(item))
    : item.serie ? `${rotuloEpisodio(item)} · ${andamento ? restante(p) : nomeEpisodio(item)}`
      : andamento ? restante(p) : [item.year, duracaoTexto(item.metadata?.runtime)].filter(Boolean).join(" · ");
  // Legenda abaixo da capa, como no Jellyfin: nome da obra e ano de lançamento (episódio: série e "T1E04 · nome").
  const legendaNome = item.serie ? item.serie.nome : item.title;
  const legendaLinha = item.ehSerie ? `${item.episodios.length} ${item.episodios.length === 1 ? "episódio" : "episódios"}`
    : item.serie ? `${rotuloEpisodio(item)} · ${nomeEpisodio(item)}` : String(item.year ?? "");
  return `<article class="titulo titulo-${formato}" role="listitem">
    <button type="button" class="titulo-capa" data-detalhes="${detalhesId}" aria-label="${escapar(nome)}: mais informações">
      ${largo ? imagem(item, "fundo", [780, 1280], "(max-width: 700px) 70vw, 340px", "titulo-img") : imagem(item, "poster", [185, 342, 500], "(max-width: 700px) 40vw, 180px", "titulo-img")}
      <span class="titulo-nome-reserva">${escapar(item.title)}</span>
      ${item.ehSerie ? `<span class="titulo-selo">${item.episodios.length}</span>` : ""}
      ${andamento ? `<span class="titulo-progresso"><span style="width:${percentual(alvo).toFixed(1)}%"></span></span>` : ""}
    </button>
    <div class="titulo-painel">
      <button type="button" class="titulo-play" data-play="${alvo.id}" title="${andamento ? "Continuar" : "Assistir"}">${ICONE_PLAY}<span class="visualmente-oculto">${andamento ? "Continuar" : "Assistir"} ${escapar(item.title)}</span></button>
      <button type="button" class="titulo-info" data-detalhes="${detalhesId}" title="Mais informações" aria-label="Mais informações sobre ${escapar(item.title)}">${ICONE_INFO}</button>
      <span class="titulo-meta"><em>${escapar(sub)}</em></span>
    </div>
    <div class="titulo-legenda">
      <span class="titulo-legenda-nome" title="${escapar(legendaNome)}">${escapar(legendaNome)}</span>
      <span class="titulo-legenda-ano">${escapar(legendaLinha)}</span>
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
  if (!media.length) return null;
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
  const alvo = playDe(item);
  const andamento = emAndamento(alvo);
  const m = item.metadata || {};
  return `<section class="destaque" aria-label="Destaque: ${escapar(item.title)}">
    ${imagem(item, "fundo", [780, 1280, 1920], "100vw", "destaque-fundo", true)}
    <div class="destaque-sombra"></div>
    <div class="destaque-info">
      <h1>${escapar(item.title)}</h1>
      <p class="destaque-meta">${item.ehSerie ? `<span>${escapar(item.bibliotecaNome)}</span><span>${escapar(contagemSerie(item))}</span>` : metaLinha(item)}${m.audienceScore ? `<span class="destaque-nota">${m.audienceScore}% do público</span>` : ""}</p>
      ${m.overview ? `<p class="destaque-sinopse">${escapar(m.overview)}</p>` : ""}
      <div class="destaque-botoes">
        <button type="button" class="botao-assistir" data-play="${alvo.id}">${ICONE_PLAY}<span>${andamento ? "Continuar" : "Assistir"}${item.ehSerie ? ` ${rotuloEpisodio(alvo)}` : ""}</span></button>
        <button type="button" class="botao-info" data-detalhes="${item.id}">${ICONE_INFO}<span>Mais informações</span></button>
      </div>
      ${andamento ? `<div class="destaque-progresso"><span style="width:${percentual(alvo).toFixed(1)}%"></span></div><p class="destaque-restante">${escapar(restante(ctx.progressFor(alvo.id)))}</p>` : ""}
    </div>
  </section>`;
}

// ---------- telas ----------
function telaInicio(media) {
  const continuar = media.filter(emAndamento).sort((a, b) => (ctx.progressFor(b.id).updatedAt || "").localeCompare(ctx.progressFor(a.id).updatedAt || ""));
  const { entradas, series } = ctx.dados;
  const generos = new Map();
  for (const item of entradas) for (const g of item.metadata?.genres ?? []) generos.set(g, [...(generos.get(g) ?? []), item]);
  const porGenero = [...generos.entries()].filter(([, itens]) => itens.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  // Uma fileira por biblioteca, na ordem do Painel (como "Adicionados recentemente em …" do Jellyfin).
  const porBiblioteca = bibliotecas().map((b) => [b, entradas.filter((e) => e.bibliotecaId === b.id).sort(porData).slice(0, 24)]);
  return destaque(escolherDestaque(entradas))
    + `<div class="fileiras">`
    + fileira("Continuar assistindo", continuar, "largo")
    + fileira("A seguir", aSeguir(series), "largo")
    + porBiblioteca.map(([b, itens]) => fileira(`Adicionados recentemente em ${b.nome}`, itens)).join("")
    + porGenero.map(([g, itens]) => fileira(g, itens)).join("")
    + `</div>`;
}
function grade(titulo, subtitulo, itens, formato = "poster", filtros = "") {
  return `<section class="catalogo">
    <div class="catalogo-cabecalho"><div><h1>${escapar(titulo)}</h1>${subtitulo ? `<p>${escapar(subtitulo)}</p>` : ""}</div>${filtros}</div>
    ${itens.length ? `<div class="grade grade-${formato}" role="list">${itens.map((i) => cartao(i, formato)).join("")}</div>` : `<div class="vazio">Nada encontrado nesta biblioteca ainda.</div>`}
  </section>`;
}
/** Bibliotecas visíveis; sem a lista do servidor, deduz pelas mídias. */
function bibliotecas() {
  if (ctx.bibliotecas?.length) return ctx.bibliotecas;
  const vistas = new Map();
  for (const m of ctx.media) if (m.bibliotecaId && !vistas.has(m.bibliotecaId)) vistas.set(m.bibliotecaId, { id: m.bibliotecaId, nome: m.bibliotecaNome, tipo: m.bibliotecaTipo || "movies" });
  return [...vistas.values()];
}
function telaBiblioteca(biblioteca) {
  const { entradas } = ctx.dados;
  const daBiblioteca = entradas.filter((e) => e.bibliotecaId === biblioteca.id);
  const generos = [...new Set(daBiblioteca.flatMap((m) => m.metadata?.genres ?? []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const { genero = "", ordem = "titulo" } = ctx.filtros ?? {};
  const itens = genero ? daBiblioteca.filter((m) => m.metadata?.genres?.includes(genero)) : [...daBiblioteca];
  itens.sort(ordem === "recentes" ? porData : ordem === "ano" ? (a, b) => (b.year || 0) - (a.year || 0) || porTitulo(a, b) : porTitulo);
  const filtros = `<div class="catalogo-filtros">
    ${generos.length ? `<label><span class="visualmente-oculto">Gênero</span><select data-filtro="genero"><option value="">Todos os gêneros</option>${generos.map((g) => `<option${g === genero ? " selected" : ""}>${escapar(g)}</option>`).join("")}</select></label>` : ""}
    <label><span class="visualmente-oculto">Ordenar</span><select data-filtro="ordem">
      <option value="titulo"${ordem === "titulo" ? " selected" : ""}>Título (A–Z)</option>
      <option value="recentes"${ordem === "recentes" ? " selected" : ""}>Adicionados recentemente</option>
      ${biblioteca.tipo === "movies" ? `<option value="ano"${ordem === "ano" ? " selected" : ""}>Ano de lançamento</option>` : ""}</select></label>
  </div>`;
  const series = itens.filter((e) => e.ehSerie).length;
  const unidade = series === itens.length && itens.length ? (itens.length === 1 ? "série" : "séries") : (itens.length === 1 ? "título" : "títulos");
  return grade(biblioteca.nome, `${itens.length} ${unidade}`, itens, "poster", filtros);
}

// ---------- janela de detalhes ----------
function fecharDetalhes() {
  const janela = document.querySelector(".detalhes");
  if (!janela) return;
  janela.remove();
  document.body.classList.remove("detalhes-aberto");
  ctx?.focoAnterior?.focus?.();
}
function listaEpisodios(serie, temporada) {
  return serie.episodios.filter((e) => e.serie.temporada === temporada).map((e) => {
    const andamento = emAndamento(e), visto = concluido(e);
    return `<article class="episodio${visto ? " visto" : ""}">
      <button type="button" class="episodio-capa" data-play="${e.id}" aria-label="Assistir ${escapar(rotuloEpisodio(e))}: ${escapar(nomeEpisodio(e))}">
        ${imagem(e, "fundo", [780], "220px", "titulo-img")}
        <span class="episodio-play">${ICONE_PLAY}</span>
        ${andamento ? `<span class="titulo-progresso"><span style="width:${percentual(e).toFixed(1)}%"></span></span>` : ""}
      </button>
      <div class="episodio-info">
        <h4><span>${e.serie.episodio}${e.serie.episodioFinal ? `–${e.serie.episodioFinal}` : ""}.</span> ${escapar(nomeEpisodio(e))}</h4>
        <p>${escapar(rotuloEpisodio(e))}${andamento ? ` · ${escapar(restante(ctx.progressFor(e.id)))}` : visto ? " · Assistido" : ""}</p>
      </div>
    </article>`;
  }).join("");
}
function abrirDetalhesSerie(serie) {
  fecharDetalhes();
  ctx.focoAnterior = document.activeElement;
  const proximo = proximoEpisodio(serie);
  const andamento = emAndamento(proximo);
  const temporada = proximo.serie.temporada;
  const outras = ctx.dados.entradas.filter((x) => x.id !== serie.id && x.bibliotecaId === serie.bibliotecaId).slice(0, 12);
  document.body.insertAdjacentHTML("beforeend", `<div class="detalhes" role="dialog" aria-modal="true" aria-label="${escapar(serie.title)}" data-serie="${serie.id}">
    <div class="detalhes-caixa">
      <button type="button" class="detalhes-fechar" data-fechar-detalhes aria-label="Fechar">${ICONE_FECHAR}</button>
      <div class="detalhes-topo">
        ${imagem(proximo, "fundo", [780, 1280], "(max-width: 900px) 100vw, 900px", "detalhes-fundo", true)}
        <div class="detalhes-topo-sombra"></div>
        <div class="detalhes-topo-info">
          <h2>${escapar(serie.title)}</h2>
          <div class="destaque-botoes">
            <button type="button" class="botao-assistir" data-play="${proximo.id}">${ICONE_PLAY}<span>${andamento ? "Continuar" : "Assistir"} ${escapar(rotuloEpisodio(proximo))}</span><span class="visualmente-oculto"> ${escapar(serie.title)}</span></button>
          </div>
          ${andamento ? `<div class="destaque-progresso"><span style="width:${percentual(proximo).toFixed(1)}%"></span></div><p class="destaque-restante">${escapar(restante(ctx.progressFor(proximo.id)))}</p>` : ""}
        </div>
      </div>
      <div class="detalhes-corpo detalhes-corpo-serie">
        <p class="destaque-meta"><span>${escapar(serie.bibliotecaNome)}</span><span>${escapar(contagemSerie(serie))}</span></p>
      </div>
      <div class="temporadas">
        <div class="temporadas-abas" role="tablist">${serie.temporadas.map((n) => `<button type="button" role="tab" class="temporada-aba${n === temporada ? " ativa" : ""}" aria-selected="${n === temporada}" data-temporada="${n}">${n === 0 ? "Especiais" : `Temporada ${n}`}</button>`).join("")}</div>
        <div class="episodios" role="list">${listaEpisodios(serie, temporada)}</div>
      </div>
      ${outras.length ? `<div class="detalhes-parecidos"><h3>Mais em ${escapar(serie.bibliotecaNome)}</h3><div class="grade grade-poster" role="list">${outras.map((x) => cartao(x)).join("")}</div></div>` : ""}
    </div>
  </div>`);
  document.body.classList.add("detalhes-aberto");
  document.querySelector(".detalhes .botao-assistir")?.focus();
}
function trocarTemporada(botao) {
  const janela = botao.closest(".detalhes");
  const serie = ctx.dados.series.get(janela?.dataset.serie);
  if (!serie) return;
  const n = Number(botao.dataset.temporada);
  janela.querySelectorAll(".temporada-aba").forEach((b) => { const ativa = b === botao; b.classList.toggle("ativa", ativa); b.setAttribute("aria-selected", String(ativa)); });
  janela.querySelector(".episodios").innerHTML = listaEpisodios(serie, n);
}
export function abrirDetalhes(id) {
  const serie = ctx.dados.series.get(id);
  if (serie) { abrirDetalhesSerie(serie); return; }
  const item = ctx.media.find((m) => m.id === id);
  if (!item) return;
  fecharDetalhes();
  ctx.focoAnterior = document.activeElement;
  const m = item.metadata || {};
  const andamento = emAndamento(item);
  const parecidos = ctx.dados.entradas.filter((x) => x.id !== item.id && (x.metadata?.genres ?? []).some((g) => (m.genres ?? []).includes(g))).slice(0, 12);
  const extras = parecidos.length ? parecidos : ctx.dados.entradas.filter((x) => x.id !== item.id && x.bibliotecaId === item.bibliotecaId).slice(0, 12);
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
 * @param {{ media: any[], bibliotecas?: {id: string, nome: string, tipo: string}[], view: string, query: string, progressFor: Function, abrirPlayer: Function, escapeHtml: Function }} contexto
 */
export function renderCatalogo(conteudo, contexto) {
  ctx = { ...ctx, ...contexto };
  if (contexto.media || !ctx.dados) ctx.dados = montarEntradas(ctx.media);
  if (ctx.ultimaView !== ctx.view) { ctx.filtros = {}; ctx.ultimaView = ctx.view; }
  const { media, view, query } = ctx;
  const busca = query.trim().toLocaleLowerCase("pt-BR");
  // "movies" (endereço antigo) = primeira biblioteca de filmes.
  const idBiblioteca = view.startsWith("biblioteca:") ? view.slice(11) : view === "movies" ? bibliotecas().find((b) => b.tipo === "movies")?.id : null;
  const biblioteca = idBiblioteca ? bibliotecas().find((b) => b.id === idBiblioteca) : null;
  let html;
  if (busca) {
    const itens = ctx.dados.entradas.filter((m) => `${m.title} ${m.year || ""} ${m.metadata?.originalTitle || ""} ${(m.metadata?.genres ?? []).join(" ")} ${(m.episodios ?? []).map((e) => e.serie.nomeEpisodio || "").join(" ")}`.toLocaleLowerCase("pt-BR").includes(busca));
    html = grade(`Resultados para “${query.trim()}”`, `${itens.length} ${itens.length === 1 ? "resultado" : "resultados"}`, itens);
  }
  else if (view === "continue") html = grade("Continuar assistindo", "Retome de onde parou.", media.filter(emAndamento), "largo");
  else if (biblioteca) html = telaBiblioteca(biblioteca);
  else html = media.length ? telaInicio(media) : `<div class="vazio">Nenhum título nas bibliotecas ainda.</div>`;
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
    const aba = alvo.closest("[data-temporada]");
    if (aba && aba.closest(".detalhes")) { trocarTemporada(aba); return; }
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
