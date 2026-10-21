const state = {
  profile: null,
  media: [],
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

function login() {
  location.assign(`https://pugotilab.com/auth?return=${encodeURIComponent(location.href)}`);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 401) {
    login();
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

function visibleMedia() {
  const query = state.query.trim().toLocaleLowerCase("pt-BR");
  let items = state.media.filter((item) => !query || `${item.title} ${item.year || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  if (state.view === "continue") {
    items = items.filter((item) => {
      const progress = progressFor(item.id);
      return progress.position > 30 && !progress.completed;
    });
  }
  return items;
}

function card(item) {
  const progress = progressFor(item.id);
  const percent = progress.duration ? Math.min(100, progress.position / progress.duration * 100) : 0;
  const metadata = item.metadata || {};
  const scores = [
    metadata.audienceScore ? `Público ${metadata.audienceScore}%` : "",
    metadata.criticScore ? `Crítica ${metadata.criticScore}%` : ""
  ].filter(Boolean).join(" · ");
  const poster = metadata.posterUrl
    ? ` style="background-image:linear-gradient(to top,rgba(0,0,0,.35),transparent 45%),url('${encodeURI(metadata.posterUrl).replace(/'/g, "%27")}')"`
    : "";
  return `<button class="media-card" data-play="${item.id}" title="${escapeHtml(metadata.overview || item.title)}">
    <div class="poster${metadata.posterUrl ? " has-image" : ""}"${poster}>
      <span class="poster-mark">${escapeHtml(item.title.charAt(0))}</span>
      ${scores ? `<span class="score-badge">${escapeHtml(scores)}</span>` : ""}
      ${percent ? `<div class="progress-track"><div class="progress-value" style="width:${percent}%"></div></div>` : ""}
    </div>
    <div class="media-info">
      <span class="media-title">${escapeHtml(item.title)}</span>
      <div class="media-meta">${item.year || "Ano não informado"}${scores ? ` · ${escapeHtml(scores)}` : ""}</div>
    </div>
  </button>`;
}

function section(title, description, items) {
  return `<section class="section">
    <div class="section-heading"><div><h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div></div>
    ${items.length ? `<div class="media-grid">${items.map(card).join("")}</div>` : `<div class="empty">Nenhum filme encontrado nesta seção.</div>`}
  </section>`;
}

function render() {
  const items = visibleMedia();
  if (state.view === "home" && !state.query) {
    const recent = state.media.filter((item) => {
      const progress = progressFor(item.id);
      return progress.position > 30 && !progress.completed;
    }).sort((a, b) => (progressFor(b.id).updatedAt || "").localeCompare(progressFor(a.id).updatedAt || ""));
    content.innerHTML = `<section class="hero"><div><span class="eyebrow">Sua mídia. Sua biblioteca.</span>
      <h1>Pugoticine</h1><p>Filmes hospedados no seu servidor, com progresso individual integrado à sua conta Pugotilab.</p></div></section>
      ${recent.length ? section("Continuar assistindo", "Retome de onde parou.", recent.slice(0, 6)) : ""}
      ${section("Sua biblioteca", `${state.media.length} filme(s) disponível(is).`, state.media.slice(0, 12))}`;
  } else {
    const title = state.query ? `Resultados para “${state.query}”` : state.view === "continue" ? "Continuar assistindo" : "Filmes";
    content.innerHTML = section(title, state.query ? `${items.length} resultado(s).` : "Todos os títulos disponíveis.", items);
  }
  document.querySelectorAll("[data-play]").forEach((button) => button.addEventListener("click", () => openPlayer(button.dataset.play)));
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
  const audioCodecs = ["aac", "mp3"];
  if (!forceUniversal && player.canPlayType('audio/webm; codecs="opus"')) audioCodecs.push("opus");
  if (!forceUniversal && player.canPlayType('audio/mp4; codecs="ac-3"')) audioCodecs.push("ac3");
  return {
    videoCodecs,
    audioCodecs,
    supportsHls: Boolean(window.Hls?.isSupported() || player.canPlayType("application/vnd.apple.mpegurl")),
    supportsHdr: !forceUniversal && Boolean(matchMedia?.("(dynamic-range: high)")?.matches),
    maxHeight: Math.max(480, Math.min(2160, Math.round((screen.height * devicePixelRatio) / 120) * 120)),
    downlinkMbps: Number(navigator.connection?.downlink || 20)
  };
}

function languageLabel(language) {
  const labels = { por: "Português", pob: "Português (Brasil)", "pt-br": "Português (Brasil)", eng: "English", en: "English", jpn: "Japonês", spa: "Espanhol" };
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
    const embedded = technical.subtitleTracks.map((track) => `<option value="embedded:${track.streamIndex}">${escapeHtml(languageLabel(track.language))} · ${escapeHtml(track.codec.toUpperCase())}${track.kind === "bitmap" ? " · transcodificar" : ""}</option>`);
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
    track.label = languageLabel(source.language);
    track.srclang = source.language;
    track.src = `/api/media/${media.id}/embedded-subtitles/${source.streamIndex}.vtt`;
    track.default = true;
    player.append(track);
  }
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
  if (saved.position > 10 && !saved.completed && player.seekable?.length) {
    const max = player.seekable.end(player.seekable.length - 1);
    if (saved.position <= max) player.currentTime = saved.position;
  }
  player.play().catch(() => {});
  $("#player-status").textContent = "";
}

function attachSource(url, mode) {
  state.usingHls = mode !== "direct";
  if (state.usingHls && window.Hls?.isSupported()) {
    state.hls = new Hls({ maxBufferLength: 20, maxMaxBufferLength: 40, startFragPrefetch: true, manifestLoadingMaxRetry: 4, fragLoadingMaxRetry: 6 });
    state.hls.loadSource(url);
    state.hls.attachMedia(player);
    state.hls.on(Hls.Events.MANIFEST_PARSED, startPlayback);
    state.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) fallbackUniversal(data.details || "erro HLS");
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
  populateTrackControls(media, result.technical);
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
  $("#player-title").textContent = media.title;
  $("#player-meta").textContent = [media.year, metadata.runtime ? `${metadata.runtime} min` : "", metadata.audienceScore ? `Público ${metadata.audienceScore}%` : "", metadata.criticScore ? `Crítica ${metadata.criticScore}%` : ""].filter(Boolean).join(" · ");
  $("#player-mode").textContent = "Analisando";
  $("#player-modal").hidden = false;
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
    state.progress = new Map(data.progress.map((item) => [item.mediaId, item]));
    $("#profile-name").textContent = data.profile.nickname || data.profile.displayName;
    $("#profile-username").textContent = `@${data.profile.username}`;
    $("#avatar-fallback").textContent = (data.profile.nickname || data.profile.username).charAt(0).toUpperCase();
    if (data.profile.avatarUrl) $("#avatar").src = data.profile.avatarUrl;
    $("#scan-button").hidden = data.profile.role !== "admin";
    render();
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
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  state.view = button.dataset.view; state.query = ""; $("#search").value = ""; updateNavigation();
  if (innerWidth <= 700) toggleMenu(false); render();
}));
$("#search").addEventListener("input", (event) => { state.query = event.target.value; render(); });
$("#profile-button").addEventListener("click", () => { $("#profile-menu").hidden = !$("#profile-menu").hidden; });
$("#profile-open")?.addEventListener("click", (event) => { event.preventDefault(); location.assign(`https://pugotilab.com/auth/profile?return=${encodeURIComponent(window.location.href)}`); });
$("#logout").addEventListener("click", logout);
$("#profile-logout").addEventListener("click", logout);
$("#player-close").addEventListener("click", closePlayer);
$("#player-modal").addEventListener("click", (event) => { if (event.target === $("#player-modal")) closePlayer(); });
$("#player-quality").addEventListener("change", reloadPlayback);
$("#player-audio").addEventListener("change", reloadPlayback);
$("#player-subtitle").addEventListener("change", reloadPlayback);
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

bootstrap();
