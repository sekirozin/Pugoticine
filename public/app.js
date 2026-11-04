import { icone } from "/icones.js";
import { abrirPainel, fecharPainel } from "/painel.js";
import { abrirOsd, definirDuracao, definirFonteDeInfo, fecharOsd } from "/player-osd.js";
import { renderCatalogo } from "/inicio.js";

const state = {
  profile: null,
  media: [],
  bibliotecas: [],
  progress: new Map(),
  view: "home",
  query: "",
  active: null,
  technical: null,
  hls: null,
  usingHls: false,
  fallbackAttempted: false,
  saveTimer: null
};

const $ = (selector) => document.querySelector(selector);
const content = $("#content");
const sidebar = $("#sidebar");
const scrim = $("#scrim");
const player = $("#player");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

// O servidor informa o endereço de login (PUGOTILAB_LOGIN_URL); sem ele, o Pugotilab de produção.
function login(loginUrl = "https://pugotilab.com/auth") {
  location.assign(`${loginUrl}?return=${encodeURIComponent(location.href)}`);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 401) {
    const dados = await response.json().catch(() => ({}));
    login(dados.loginUrl || undefined);
    throw new Error("Login necessário");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Erro inesperado");
  return data;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, 3500);
}

function progressFor(id) {
  return state.progress.get(id) || { position: 0, duration: 0, completed: false };
}

// Painel do administrador (public/painel.js): menu do Painel do Jellyfin com uma tela por item.
function renderPainelView() {
  abrirPainel(content, {
    api, escapeHtml, toast,
    aoVarrer: (media) => { state.media = media; },
    aoMudarServidor: aplicarNomeServidor,
    // Cabeçalho do menu do Painel: volta ao app (o menu lateral normal reaparece).
    voltarAoInicio: () => { state.view = "home"; state.query = ""; updateNavigation(); render(); recarregarCatalogo(); },
    fecharMenu: () => { if (innerWidth <= 700) toggleMenu(false); }
  });
}

// Painel › Geral: o nome do servidor vira o título da página.
async function aplicarNomeServidor() {
  try {
    const servidor = await api("/api/servidor");
    document.title = servidor.nomeServidor || "Pugoticine";
  } catch { /* mantém o padrão */ }
}

function render() {
  // Painel só para administradores do Pugotilab (o servidor também recusa com 403); qualquer outro volta ao Início.
  if (state.view === "painel" && state.profile?.role !== "admin") { state.view = "home"; updateNavigation(); }
  if (state.view === "painel") { renderPainelView(); return; }
  fecharPainel();
  // Catálogo no estilo de streaming (public/inicio.js): destaque, fileiras, cartões e janela de detalhes.
  renderCatalogo(content, { media: state.media, bibliotecas: state.bibliotecas, view: state.view, query: state.query, progressFor, abrirPlayer: openPlayer, escapeHtml });
}

// Menu lateral: uma entrada por biblioteca, com o ícone do tipo (como "Minha mídia" do Jellyfin).
// Ícone do Tabler por tipo de biblioteca.
const ICONES_BIBLIOTECA = { movies: "movie", tvshows: "device-tv", mixed: "device-tv-old", outro: "folder" };
function renderNavBibliotecas() {
  const lista = $("#nav-bibliotecas");
  if (!lista) return;
  lista.innerHTML = state.bibliotecas.map((b) => `<button class="nav-item" data-view="biblioteca:${escapeHtml(b.id)}" title="${escapeHtml(b.nome)}">${icone(ICONES_BIBLIOTECA[b.tipo] ?? ICONES_BIBLIOTECA.outro)}<span>${escapeHtml(b.nome)}</span></button>`).join("");
  if (state.view === "movies") state.view = `biblioteca:${state.bibliotecas.find((b) => b.tipo === "movies")?.id ?? "filmes"}`;
  if (state.view.startsWith("biblioteca:") && !state.bibliotecas.some((b) => `biblioteca:${b.id}` === state.view)) state.view = "home";
  updateNavigation();
}
/** Recarrega mídias e bibliotecas (ex.: ao sair do Painel depois de mexer nas bibliotecas). */
async function recarregarCatalogo() {
  try {
    const data = await api("/api/bootstrap");
    state.media = data.media; state.bibliotecas = data.bibliotecas ?? [];
    state.progress = new Map(data.progress.map((item) => [item.mediaId, item]));
    renderNavBibliotecas(); render();
  } catch { /* mantém o que já está na tela */ }
}

function updateNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
}

function toggleMenu(force) {
  const open = force ?? !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", open);
  scrim.classList.toggle("visible", open && innerWidth <= 700);
  document.body.classList.toggle("sidebar-expanded", open && innerWidth > 700);
}

function browserCapabilities(forceUniversal = false) {
  const videoCodecs = ["h264"];
  if (!forceUniversal && (window.MediaSource?.isTypeSupported?.('video/mp4; codecs="hvc1.1.6.L93.B0"') || player.canPlayType('video/mp4; codecs="hvc1"'))) videoCodecs.push("hevc");
  if (!forceUniversal && window.MediaSource?.isTypeSupported?.('video/mp4; codecs="av01.0.08M.08"')) videoCodecs.push("av1");
  if (!forceUniversal && window.MediaSource?.isTypeSupported?.('video/webm; codecs="vp9"')) videoCodecs.push("vp9");
  // Áudio no HLS em fMP4 passa pelo MediaSource (hls.js): é ele que diz o que toca, como no jellyfin-web.
  const mse = (tipo) => Boolean(window.MediaSource?.isTypeSupported?.(tipo));
  const audioCodecs = ["aac"];
  if (forceUniversal) return { videoCodecs, audioCodecs, supportsHls: true, supportsHdr: false, maxHeight: 1080, downlinkMbps: 20 };
  if (mse('audio/mp4; codecs="mp3"') || mse("audio/mpeg")) audioCodecs.push("mp3");
  if (mse('audio/mp4; codecs="opus"')) audioCodecs.push("opus");
  if (mse('audio/mp4; codecs="ac-3"')) audioCodecs.push("ac3");
  if (mse('audio/mp4; codecs="ec-3"')) audioCodecs.push("eac3");
  if (mse('audio/mp4; codecs="flac"')) audioCodecs.push("flac");
  return {
    videoCodecs,
    audioCodecs,
    supportsHls: Boolean(window.Hls?.isSupported() || player.canPlayType("application/vnd.apple.mpegurl")),
    supportsHdr: !forceUniversal && Boolean(matchMedia?.("(dynamic-range: high)")?.matches),
    maxHeight: Math.max(480, Math.min(2160, Math.round((screen.height * devicePixelRatio) / 120) * 120)),
    downlinkMbps: Number(navigator.connection?.downlink || 20)
  };
}

/** "Português · FORÇADA PT-BR · embutida": nome da faixa (ou "Forçada"/"SDH") para diferenciar faixas do mesmo idioma. */
function rotuloLegendaEmbutida(track) {
  const partes = [languageLabel(track.language)];
  const titulo = String(track.title || "").trim();
  if (titulo && titulo.toLocaleLowerCase("pt-BR") !== partes[0].toLocaleLowerCase("pt-BR")) partes.push(titulo);
  if (track.forced && !/for[cç]ad|forced/i.test(titulo)) partes.push("Forçada");
  partes.push(track.kind === "bitmap" ? "embutida (imagem)" : "embutida");
  return partes.join(" · ");
}

function languageLabel(language) {
  const labels = { por: "Português", pob: "Português (Brasil)", "pt-br": "Português (Brasil)", eng: "Inglês", en: "Inglês", jpn: "Japonês", spa: "Espanhol",
    fre: "Francês", fra: "Francês", ger: "Alemão", deu: "Alemão", ita: "Italiano", rus: "Russo", chi: "Chinês", zho: "Chinês", ara: "Árabe", und: "Indefinido" };
  return labels[String(language || "").toLowerCase()] || String(language || "Indefinido").toUpperCase();
}

function populateTrackControls(media, technical) {
  const audio = $("#player-audio");
  const subtitle = $("#player-subtitle");
  if (!audio.dataset.ready) {
    audio.innerHTML = technical.audioTracks.length
      ? technical.audioTracks.map((track) => `<option value="${track.streamIndex}"${track.default ? " selected" : ""}>${escapeHtml(languageLabel(track.language))} · ${escapeHtml(track.codec.toUpperCase())} · ${track.channels || 2} canais${track.title ? ` · ${escapeHtml(track.title)}` : ""}</option>`).join("")
      : `<option value="">Sem áudio</option>`;
    audio.dataset.ready = "1";
  }
  if (!subtitle.dataset.ready) {
    const external = media.subtitles.map((track) => `<option value="external:${track.id}"${track.language === "pt-BR" ? " selected" : ""}>${escapeHtml(track.label)} · externa</option>`);
    const embedded = technical.subtitleTracks.map((track) => `<option value="embedded:${track.streamIndex}">${escapeHtml(rotuloLegendaEmbutida(track))}</option>`);
    subtitle.innerHTML = [`<option value="none">Desativada</option>`, ...external, ...embedded].join("");
    subtitle.dataset.ready = "1";
  }
}

function clearVideo() {
  state.hls?.destroy();
  state.hls = null;
  player.onerror = null;
  player.pause();
  player.removeAttribute("src");
  player.querySelectorAll("track").forEach((track) => track.remove());
  player.load();
}

function selectedSubtitleRequest(technical) {
  const value = $("#player-subtitle").value;
  if (!value.startsWith("embedded:")) return null;
  const streamIndex = Number(value.slice("embedded:".length));
  const track = technical?.subtitleTracks.find((item) => item.streamIndex === streamIndex);
  return track?.kind === "bitmap" ? streamIndex : null;
}

function addSelectedTextTrack(media, technical) {
  const value = $("#player-subtitle").value;
  if (value.startsWith("external:")) {
    const id = value.slice("external:".length);
    const source = media.subtitles.find((item) => item.id === id);
    if (!source) return;
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = source.label;
    track.srclang = source.language;
    track.src = `/api/media/${media.id}/subtitles/${source.id}.vtt`;
    track.default = true;
    player.append(track);
  } else if (value.startsWith("embedded:")) {
    const streamIndex = Number(value.slice("embedded:".length));
    const source = technical.subtitleTracks.find((item) => item.streamIndex === streamIndex && item.kind === "text");
    if (!source) return;
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = rotuloLegendaEmbutida(source);
    track.srclang = source.language;
    track.src = `/api/media/${media.id}/embedded-subtitles/${source.streamIndex}.vtt`;
    track.default = true;
    player.append(track);
  }
  // Faixa adicionada com o vídeo já carregado não liga sozinha pelo "default": liga aqui.
  const adicionada = player.querySelector("track:last-of-type");
  if (adicionada) adicionada.track.mode = "showing";
}

// Troca de legenda como no Jellyfin: legenda de texto (externa ou interna) entra e sai sem recarregar o vídeo; só a
// legenda em imagem (PGS/VobSub), que precisa ser desenhada no vídeo pelo servidor, recarrega a reprodução.
async function trocarLegenda() {
  const tecnico = state.technical;
  const valor = $("#player-subtitle").value;
  const queimada = (v) => String(v).startsWith("embedded:") && tecnico?.subtitleTracks.find((t) => t.streamIndex === Number(String(v).slice(9)))?.kind === "bitmap";
  const anterior = state.legendaAtual ?? "none";
  state.legendaAtual = valor;
  if (queimada(valor) || queimada(anterior)) { await reloadPlayback(); return; }
  player.querySelectorAll("track").forEach((track) => track.remove());
  for (const faixa of player.textTracks) faixa.mode = "disabled";
  if (state.active && tecnico) addSelectedTextTrack(state.active, tecnico);
}

async function saveProgress() {
  if (!state.active) return;
  const duration = state.technical?.duration || player.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    const result = await api("/api/progress", {
      method: "POST",
      body: JSON.stringify({ mediaId: state.active.id, position: player.currentTime, duration })
    });
    state.progress.set(state.active.id, result.progress);
  } catch (error) {
    console.error(error);
  }
}

function startPlayback() {
  if (!state.active) return;
  const saved = progressFor(state.active.id);
  // No HLS o hls.js já começou na posição salva (startPosition); aqui só o modo direto.
  if (!state.usingHls && saved.position > 10 && !saved.completed && player.seekable?.length) {
    const max = player.seekable.end(player.seekable.length - 1);
    if (saved.position <= max) player.currentTime = saved.position;
  }
  player.play().catch(() => {});
  $("#player-status").textContent = "";
}

// Posição para retomar (a mesma regra de startPlayback): com a playlist VOD o hls.js já começa nela e o servidor
// gera os segmentos a partir dali, sem converter o começo do filme.
function resumePosition() {
  const saved = state.active ? progressFor(state.active.id) : null;
  return saved && saved.position > 10 && !saved.completed ? saved.position : -1;
}

function attachSource(url, mode) {
  state.usingHls = mode !== "direct";
  if (state.usingHls && window.Hls?.isSupported()) {
    // Mesma configuração e recuperação de erros do jellyfin-web (htmlVideoPlayer + htmlMediaHelper).
    state.hls = new Hls({ startPosition: resumePosition(), manifestLoadingTimeOut: 20000, maxBufferLength: 30, maxMaxBufferLength: 30 });
    state.hls.loadSource(url);
    state.hls.attachMedia(player);
    state.hls.on(Hls.Events.MANIFEST_PARSED, startPlayback);
    let recuperacoesDeMidia = 0;
    state.hls.on(Hls.Events.ERROR, (_event, data) => {
      console.error(`HLS: ${data.type} ${data.details || ""}${data.fatal ? " (fatal)" : ""}${data.error ? ` — ${data.error.message || data.error}` : ""}`);
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.response?.code >= 400) { fallbackUniversal(`servidor respondeu ${data.response.code}`); return; }
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { state.hls.startLoad(); return; }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recuperacoesDeMidia < 2) {
        if (recuperacoesDeMidia++ === 1) state.hls.swapAudioCodec();
        state.hls.recoverMediaError();
        return;
      }
      fallbackUniversal(data.details || "erro HLS");
    });
  } else {
    player.src = url;
    player.addEventListener("loadedmetadata", startPlayback, { once: true });
    player.onerror = () => fallbackUniversal("codec recusado pelo navegador");
  }
}

async function requestPlayback(forceUniversal = false) {
  const media = state.active;
  if (!media) return;
  clearVideo();
  $("#player-status").textContent = "Analisando codecs e preparando o vídeo...";
  const audioValue = $("#player-audio").dataset.ready ? Number($("#player-audio").value) : null;
  const request = {
    capabilities: browserCapabilities(forceUniversal),
    quality: $("#player-quality").value,
    audioStreamIndex: Number.isFinite(audioValue) ? audioValue : null,
    subtitleStreamIndex: selectedSubtitleRequest(state.technical)
  };
  const result = await api(`/api/media/${media.id}/playback`, { method: "POST", body: JSON.stringify(request) });
  state.technical = result.technical;
  state.plan = result.plan;
  definirDuracao(result.technical.duration);
  populateTrackControls(media, result.technical);
  state.legendaAtual = $("#player-subtitle").value;
  addSelectedTextTrack(media, result.technical);
  const labels = { direct: "Direct Play", remux: "Remux", transcode: "Transcodificação" };
  $("#player-mode").textContent = `${labels[result.plan.mode]} · ${result.plan.reason}`;
  $("#player-status").textContent = result.plan.mode === "transcode" ? "Iniciando transcodificação otimizada..." : "Preparando reprodução...";
  attachSource(result.url, result.plan.mode);
}

async function fallbackUniversal(reason) {
  if (!state.active || state.fallbackAttempted) {
    $("#player-status").textContent = `Não foi possível reproduzir (${reason}).`;
    return;
  }
  state.fallbackAttempted = true;
  $("#player-status").textContent = "Tentando modo universal H.264/AAC...";
  if (state.usingHls) await fetch(`/api/media/${state.active.id}/hls`, { method: "DELETE" }).catch(() => {});
  setTimeout(() => requestPlayback(true).catch((error) => { $("#player-status").textContent = error.message; }), 400);
}

async function openPlayer(id) {
  await closePlayer();
  const media = state.media.find((item) => item.id === id);
  if (!media) return;
  state.active = media;
  state.technical = null;
  state.fallbackAttempted = false;
  $("#player-audio").removeAttribute("data-ready");
  $("#player-subtitle").removeAttribute("data-ready");
  $("#player-audio").innerHTML = `<option>Analisando...</option>`;
  $("#player-subtitle").innerHTML = `<option>Desativada</option>`;
  const metadata = media.metadata || {};
  $("#player-title").textContent = media.year ? `${media.title} (${media.year})` : media.title;
  $("#player-meta").textContent = [metadata.runtime ? `${metadata.runtime} min` : "", metadata.audienceScore ? `Público ${metadata.audienceScore}%` : "", metadata.criticScore ? `Crítica ${metadata.criticScore}%` : ""].filter(Boolean).join(" · ");
  $("#player-mode").textContent = "Analisando";
  $("#player-modal").hidden = false;
  abrirOsd({ duracao: metadata.runtime ? metadata.runtime * 60 : 0 });
  document.body.style.overflow = "hidden";
  state.saveTimer = setInterval(saveProgress, 15000);
  requestPlayback().catch((error) => { $("#player-status").textContent = error.message; });
}

async function reloadPlayback() {
  if (!state.active) return;
  await saveProgress();
  if (state.usingHls) await fetch(`/api/media/${state.active.id}/hls`, { method: "DELETE" }).catch(() => {});
  state.fallbackAttempted = false;
  await requestPlayback();
}

async function closePlayer() {
  if (!state.active) return;
  await saveProgress();
  const previous = state.active;
  const usedHls = state.usingHls;
  clearInterval(state.saveTimer);
  state.saveTimer = null;
  clearVideo();
  state.active = null;
  state.technical = null;
  state.usingHls = false;
  await fecharOsd();
  $("#player-modal").hidden = true;
  document.body.style.overflow = "";
  if (usedHls) fetch(`/api/media/${previous.id}/hls`, { method: "DELETE", keepalive: true }).catch(() => {});
  render();
}

function logout() {
  location.assign(`https://pugotilab.com/auth/logout?return=${encodeURIComponent(`${location.origin}/`)}`);
}

async function bootstrap() {
  try {
    const data = await api("/api/bootstrap");
    state.profile = data.profile;
    state.media = data.media;
    state.bibliotecas = data.bibliotecas ?? [];
    renderNavBibliotecas();
    state.progress = new Map(data.progress.map((item) => [item.mediaId, item]));
    $("#scan-button").hidden = data.profile.role !== "admin";
    $("#painel-button").hidden = data.profile.role !== "admin";
    aplicarNomeServidor();
    render();
    window.dispatchEvent(new CustomEvent("pugoticine:pronto"));
    const requestedMedia = new URLSearchParams(location.search).get("play");
    if (requestedMedia && state.media.some((item) => item.id === requestedMedia)) {
      history.replaceState(null, "", location.pathname);
      await openPlayer(requestedMedia);
    }
  } catch (error) {
    content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

$("#menu-toggle").addEventListener("click", () => toggleMenu());
scrim.addEventListener("click", () => toggleMenu(false));
$("#brand").addEventListener("click", () => { state.view = "home"; state.query = ""; $("#search").value = ""; updateNavigation(); render(); });
// Delegação: as entradas das bibliotecas são criadas depois de carregar.
$("#sidebar").addEventListener("click", (event) => {
  const button = event.target.closest("nav [data-view]");
  if (!button) return;
  state.view = button.dataset.view; state.query = ""; $("#search").value = ""; updateNavigation();
  if (innerWidth <= 700) toggleMenu(false); render();
});
$("#search").addEventListener("input", (event) => { state.query = event.target.value; render(); });
$("#logout").addEventListener("click", logout);
$("#player-close").addEventListener("click", closePlayer);
$("#player-quality").addEventListener("change", reloadPlayback);
$("#player-audio").addEventListener("change", reloadPlayback);
$("#player-subtitle").addEventListener("change", () => trocarLegenda().catch((error) => { $("#player-status").textContent = error.message; }));
// "Informações de reprodução" (menu de configurações do player).
definirFonteDeInfo(() => {
  const tecnico = state.technical, video = tecnico?.video;
  const audio = tecnico?.audioTracks.find((faixa) => faixa.streamIndex === state.plan?.audioStreamIndex);
  return [
    ["Modo", $("#player-mode").textContent],
    ["Arquivo", tecnico ? `${tecnico.container} · ${Math.round((tecnico.bitrate || 0) / 1000)} kbps` : "—"],
    ["Vídeo", video ? `${video.codec.toUpperCase()} ${video.width}×${video.height}${video.hdr ? " HDR" : ""}` : "—"],
    ["Áudio", audio ? `${audio.codec.toUpperCase()} ${audio.channels || 2} canais${state.plan?.audioCopy ? "" : " → AAC estéreo"}` : "—"]
  ];
});
$("#scan-button").addEventListener("click", async () => {
  try {
    toast("Atualizando catálogo...");
    const data = await api("/api/catalog/scan", { method: "POST" });
    state.media = data.media; render(); toast("Catálogo atualizado.");
  } catch (error) { toast(error.message); }
});
addEventListener("resize", () => { if (innerWidth > 700) scrim.classList.remove("visible"); });
addEventListener("beforeunload", () => {
  if (!state.active || !state.technical?.duration) return;
  navigator.sendBeacon("/api/progress", new Blob([JSON.stringify({
    mediaId: state.active.id, position: player.currentTime, duration: state.technical.duration
  })], { type: "application/json" }));
});

// Ganchos para módulos externos (salas sincronizadas em salas.js): abrir/fechar o player e ler o catálogo.
window.pugoticine = {
  abrirPlayer: (id) => openPlayer(id),
  fecharPlayer: () => closePlayer(),
  midias: () => state.media,
  perfil: () => state.profile,
  midiaAberta: () => state.active?.id ?? null
};

bootstrap();
