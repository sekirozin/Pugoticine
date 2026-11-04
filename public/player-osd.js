// Controles do player em tela cheia, no estilo do Jellyfin 10.11.10 (jellyfin-web controllers/playback/video):
// barra superior (voltar, título, ações), progresso com tempo atual e restante, voltar 10 s / reproduzir / avançar 30 s
// (padrões skipBackLength/skipForwardLength), "Termina às", legendas, áudio, mudo + volume, configurações (qualidade,
// velocidade, proporção, informações), vídeo destacado (picture-in-picture) e tela cheia. Os controles somem depois
// de 3 s sem mexer (osdHideTimeout) e os atalhos são os do Jellyfin: espaço/K, J/←, L/→, ↑/↓, F, M, Home, End, Esc.
// As escolhas de qualidade, áudio e legenda continuam nos <select> escondidos que o app.js já usa: escolher num menu
// muda o select e dispara "change".
import { conteudoIcone } from "/icones.js";
const $ = (seletor) => document.querySelector(seletor);
const VOLTAR_S = 10;
const AVANCAR_S = 30;
const OCULTAR_MS = 3000;
// Ícones do Tabler (public/icones.js), trocados no <svg> conforme o estado.
const ICONES = { play: "player-play-cheio", pausa: "player-pause-cheio", volume: "volume", mudo: "volume-off", telaCheia: "maximize", sairTelaCheia: "minimize" };
function trocarIcone(seletor, nome) {
  const svg = $(seletor);
  if (!svg || svg.dataset.icone === nome) return;
  svg.innerHTML = conteudoIcone(nome); svg.dataset.icone = nome;
  svg.classList.toggle("icone-tabler-cheio", nome.endsWith("-cheio")); svg.classList.toggle("icone-tabler", !nome.endsWith("-cheio"));
}
const VELOCIDADES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const PROPORCOES = [["contain", "Automática"], ["cover", "Cortar"], ["fill", "Preencher"]];

const player = $("#player");
const modal = $("#player-modal");
const posicao = $("#osd-posicao");
const menu = $("#osd-menu");
const info = $("#osd-info");
let temporizador = null;
let arrastando = false;
let botaoDoMenu = null;
let fonteDeInfo = () => [];

function tempo(segundos) {
  if (!Number.isFinite(segundos) || segundos < 0) segundos = 0;
  const s = Math.floor(segundos % 60), m = Math.floor(segundos / 60) % 60, h = Math.floor(segundos / 3600);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function duracao() {
  if (Number.isFinite(player.duration) && player.duration > 0) return player.duration;
  return Number(modal.dataset.duracao) || 0;
}
function aberto() {
  return !modal.hidden;
}

// ---------- mostrar / ocultar (showOsd / hideOsd) ----------
function mostrar() {
  modal.classList.remove("osd-oculto");
  clearTimeout(temporizador);
  temporizador = setTimeout(ocultar, OCULTAR_MS);
}
function ocultar() {
  // Não some com o vídeo parado, com um menu aberto ou com o mouse sobre os controles.
  if (player.paused || !menu.hidden || !info.hidden || modal.querySelector(".osd-topo:hover, .osd-base:hover")) {
    clearTimeout(temporizador);
    temporizador = setTimeout(ocultar, OCULTAR_MS);
    return;
  }
  modal.classList.add("osd-oculto");
}

// ---------- estado na tela ----------
function atualizarTempo() {
  const total = duracao(), atual = player.currentTime;
  if (!arrastando) {
    posicao.max = String(total || 1);
    posicao.value = String(atual);
    $("#osd-atual").textContent = tempo(atual);
  }
  modal.style.setProperty("--osd-progresso", `${total ? (Number(posicao.value) / total) * 100 : 0}%`);
  $("#osd-restante").textContent = `-${tempo(total - atual)}`;
  const taxa = player.playbackRate || 1;
  if (total && !player.paused) {
    const fim = new Date(Date.now() + ((total - atual) / taxa) * 1000);
    $("#osd-termina").textContent = `Termina às ${fim.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  else $("#osd-termina").textContent = "";
  let carregado = 0;
  for (let i = 0; i < player.buffered.length; i++) {
    if (player.buffered.start(i) <= atual + 0.5 && player.buffered.end(i) >= atual) carregado = player.buffered.end(i);
  }
  $("#osd-buffer").style.width = `${total ? Math.min(100, (carregado / total) * 100) : 0}%`;
}
function atualizarPlay() {
  trocarIcone("#osd-play-icone", player.paused ? ICONES.play : ICONES.pausa);
  const rotulo = player.paused ? "Reproduzir (K)" : "Pausar (K)";
  $("#osd-play").title = rotulo;
  $("#osd-play").setAttribute("aria-label", rotulo.replace(" (K)", ""));
  if (player.paused) mostrar();
}
function atualizarVolume() {
  const mudo = player.muted || player.volume === 0;
  trocarIcone("#osd-volume-icone", mudo ? ICONES.mudo : ICONES.volume);
  $("#osd-volume").value = String(Math.round((player.muted ? 0 : player.volume) * 100));
  modal.style.setProperty("--osd-volume", `${player.muted ? 0 : player.volume * 100}%`);
  try { localStorage.setItem("pugoticine-volume", JSON.stringify({ volume: player.volume, mudo: player.muted })); } catch {}
}
function atualizarTelaCheia() {
  const ativa = Boolean(document.fullscreenElement);
  trocarIcone("#osd-tela-cheia-icone", ativa ? ICONES.sairTelaCheia : ICONES.telaCheia);
  $("#osd-tela-cheia").title = ativa ? "Sair da tela cheia (F)" : "Tela cheia (F)";
}

// ---------- ações (playbackManager) ----------
function alternarPlay() {
  if (player.paused) player.play().catch(() => {});
  else player.pause();
}
function pular(segundos) {
  const total = duracao();
  player.currentTime = Math.max(0, Math.min(total ? total - 0.5 : Infinity, player.currentTime + segundos));
  mostrar();
}
function mudarVolume(delta) {
  player.muted = false;
  player.volume = Math.max(0, Math.min(1, Math.round((player.volume + delta) * 100) / 100));
  mostrar();
}
async function alternarTelaCheia() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await modal.requestFullscreen();
  } catch {}
}
async function alternarPip() {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await player.requestPictureInPicture();
  } catch {}
}

// ---------- menus (actionSheet do Jellyfin) ----------
function fecharMenu() {
  menu.hidden = true;
  menu.innerHTML = "";
  botaoDoMenu?.setAttribute("aria-expanded", "false");
  botaoDoMenu = null;
}
function abrirMenu(botao, titulo, itens) {
  const mesmoBotao = botaoDoMenu === botao && !menu.hidden;
  fecharMenu();
  if (mesmoBotao) return;
  botaoDoMenu = botao;
  botao.setAttribute("aria-expanded", "true");
  menu.innerHTML = `<p class="osd-menu-titulo">${titulo}</p>` + itens.map((item, i) =>
    `<button type="button" role="menuitemradio" class="osd-menu-item" aria-checked="${item.ativo ? "true" : "false"}" data-indice="${i}">
      <span class="osd-menu-marca">${item.ativo ? "✓" : ""}</span><span class="osd-menu-rotulo">${item.rotulo}</span>${item.detalhe ? `<span class="osd-menu-detalhe">${item.detalhe}</span>` : ""}</button>`).join("");
  menu.querySelectorAll("[data-indice]").forEach((botaoItem) => botaoItem.addEventListener("click", (evento) => {
    evento.stopPropagation();
    const item = itens[Number(botaoItem.dataset.indice)];
    if (!item.submenu) fecharMenu();
    item.acao();
  }));
  const caixa = botao.getBoundingClientRect();
  menu.style.right = `${Math.max(12, innerWidth - caixa.right)}px`;
  menu.hidden = false;
  mostrar();
  menu.querySelector('[aria-checked="true"]')?.focus() ?? menu.querySelector("button")?.focus();
}
const escapar = (texto) => String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function itensDoSelect(select) {
  return [...select.options].map((opcao) => ({
    rotulo: escapar(opcao.textContent), ativo: opcao.value === select.value,
    acao: () => { if (select.value !== opcao.value) { select.value = opcao.value; select.dispatchEvent(new Event("change")); } }
  }));
}
function menuLegendas() {
  abrirMenu($("#osd-legendas"), "Legendas", itensDoSelect($("#player-subtitle")));
}
function menuAudio() {
  abrirMenu($("#osd-audio"), "Áudio", itensDoSelect($("#player-audio")));
}
function rotuloSelecionado(select) {
  return select.options[select.selectedIndex]?.textContent ?? "";
}
function menuConfiguracoes() {
  const botao = $("#osd-config");
  const proporcao = PROPORCOES.find(([valor]) => valor === (player.style.objectFit || "contain"))?.[1] ?? "Automática";
  abrirMenu(botao, "Configurações", [
    { rotulo: "Qualidade", detalhe: escapar(rotuloSelecionado($("#player-quality"))), submenu: true, acao: () => { botaoDoMenu = null; abrirMenu(botao, "Qualidade", itensDoSelect($("#player-quality"))); } },
    { rotulo: "Velocidade", detalhe: `${player.playbackRate}x`, submenu: true, acao: () => {
      botaoDoMenu = null;
      abrirMenu(botao, "Velocidade", VELOCIDADES.map((v) => ({ rotulo: v === 1 ? "Normal" : `${v}x`, ativo: player.playbackRate === v, acao: () => { player.playbackRate = v; } })));
    } },
    { rotulo: "Proporção", detalhe: proporcao, submenu: true, acao: () => {
      botaoDoMenu = null;
      abrirMenu(botao, "Proporção", PROPORCOES.map(([valor, rotulo]) => ({ rotulo, ativo: (player.style.objectFit || "contain") === valor, acao: () => { player.style.objectFit = valor; } })));
    } },
    { rotulo: "Informações de reprodução", ativo: !info.hidden, acao: alternarInfo }
  ]);
}
function alternarInfo() {
  info.hidden = !info.hidden;
  if (!info.hidden) desenharInfo();
}
function desenharInfo() {
  if (info.hidden) return;
  const linhas = [...fonteDeInfo(),
    ["Resolução na tela", player.videoWidth ? `${player.videoWidth}×${player.videoHeight}` : "—"],
    ["Carregado à frente", `${Math.max(0, ([...Array(player.buffered.length).keys()].map((i) => player.buffered.end(i)).find((fim) => fim >= player.currentTime) ?? player.currentTime) - player.currentTime).toFixed(1)} s`],
    ["Quadros perdidos", String(player.getVideoPlaybackQuality?.().droppedVideoFrames ?? "—")]];
  info.innerHTML = `<p class="osd-menu-titulo">Informações de reprodução</p>` + linhas.map(([nome, valor]) => `<div><span>${escapar(nome)}</span><strong>${escapar(valor)}</strong></div>`).join("");
}

// ---------- API usada pelo app.js ----------
export function abrirOsd({ duracao: total = 0 } = {}) {
  modal.dataset.duracao = String(total || 0);
  fecharMenu();
  info.hidden = true;
  posicao.value = "0";
  player.style.objectFit = "contain";
  player.playbackRate = 1;
  $("#osd-pip").hidden = !(document.pictureInPictureEnabled && typeof player.requestPictureInPicture === "function");
  atualizarTempo(); atualizarPlay(); atualizarVolume(); atualizarTelaCheia();
  mostrar();
}
export function definirDuracao(total) {
  modal.dataset.duracao = String(total || 0);
  atualizarTempo();
}
export async function fecharOsd() {
  fecharMenu();
  info.hidden = true;
  clearTimeout(temporizador);
  modal.classList.remove("osd-oculto");
  try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); } catch {}
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
}
/** Linhas extras para "Informações de reprodução" (modo, motivo, codecs). */
export function definirFonteDeInfo(funcao) {
  fonteDeInfo = funcao;
}

// ---------- ligações ----------
try {
  const salvo = JSON.parse(localStorage.getItem("pugoticine-volume") ?? "null");
  if (salvo) { player.volume = Math.max(0, Math.min(1, Number(salvo.volume) || 0)); player.muted = Boolean(salvo.mudo); }
} catch {}
for (const evento of ["timeupdate", "durationchange", "progress", "seeked", "ratechange"]) player.addEventListener(evento, atualizarTempo);
for (const evento of ["play", "pause", "playing"]) player.addEventListener(evento, () => { atualizarPlay(); atualizarTempo(); });
player.addEventListener("volumechange", atualizarVolume);
setInterval(desenharInfo, 1000);
document.addEventListener("fullscreenchange", atualizarTelaCheia);

$("#osd-play").addEventListener("click", alternarPlay);
$("#osd-voltar").addEventListener("click", () => pular(-VOLTAR_S));
$("#osd-avancar").addEventListener("click", () => pular(AVANCAR_S));
$("#osd-mudo").addEventListener("click", () => { player.muted = !player.muted; if (!player.muted && player.volume === 0) player.volume = 0.5; });
$("#osd-volume").addEventListener("input", (evento) => { player.muted = false; player.volume = Number(evento.target.value) / 100; });
$("#osd-tela-cheia").addEventListener("click", alternarTelaCheia);
$("#osd-pip").addEventListener("click", alternarPip);
$("#osd-legendas").addEventListener("click", (evento) => { evento.stopPropagation(); menuLegendas(); });
$("#osd-audio").addEventListener("click", (evento) => { evento.stopPropagation(); menuAudio(); });
$("#osd-config").addEventListener("click", (evento) => { evento.stopPropagation(); menuConfiguracoes(); });

posicao.addEventListener("input", () => {
  arrastando = true;
  const valor = Number(posicao.value);
  $("#osd-atual").textContent = tempo(valor);
  const dica = $("#osd-dica");
  dica.hidden = false;
  dica.textContent = tempo(valor);
  dica.style.left = `${(valor / (Number(posicao.max) || 1)) * 100}%`;
  modal.style.setProperty("--osd-progresso", `${(valor / (Number(posicao.max) || 1)) * 100}%`);
  mostrar();
});
posicao.addEventListener("change", () => {
  arrastando = false;
  $("#osd-dica").hidden = true;
  player.currentTime = Number(posicao.value);
});

// Clique no vídeo pausa/continua; clique duplo alterna a tela cheia (como no jellyfin-web no computador).
let cliqueTimer = null;
player.addEventListener("click", () => {
  if (!menu.hidden) { fecharMenu(); return; }
  clearTimeout(cliqueTimer);
  cliqueTimer = setTimeout(alternarPlay, 220);
});
player.addEventListener("dblclick", () => { clearTimeout(cliqueTimer); alternarTelaCheia(); });
for (const evento of ["mousemove", "pointerdown", "touchstart"]) modal.addEventListener(evento, mostrar, { passive: true });
document.addEventListener("click", (evento) => { if (!menu.hidden && !menu.contains(evento.target)) fecharMenu(); });

document.addEventListener("keydown", (evento) => {
  if (!aberto() || evento.ctrlKey || evento.altKey || evento.metaKey) return;
  const alvo = evento.target;
  if (alvo instanceof HTMLInputElement && alvo.type !== "range") return;
  if (alvo instanceof HTMLSelectElement || alvo instanceof HTMLTextAreaElement) return;
  const tecla = evento.key;
  const acoes = {
    " ": alternarPlay, k: alternarPlay, K: alternarPlay,
    j: () => pular(-VOLTAR_S), J: () => pular(-VOLTAR_S), ArrowLeft: () => pular(-VOLTAR_S),
    l: () => pular(AVANCAR_S), L: () => pular(AVANCAR_S), ArrowRight: () => pular(AVANCAR_S),
    ArrowUp: () => mudarVolume(0.05), ArrowDown: () => mudarVolume(-0.05),
    f: alternarTelaCheia, F: alternarTelaCheia,
    m: () => { player.muted = !player.muted; }, M: () => { player.muted = !player.muted; },
    Home: () => { player.currentTime = 0; }, End: () => { player.currentTime = Math.max(0, duracao() - 1); }
  };
  if (tecla === "Escape") {
    // Esc fecha o menu aberto; com a tela cheia o navegador já sai dela; senão, volta (fecha o player).
    if (!menu.hidden || !info.hidden) { fecharMenu(); info.hidden = true; evento.preventDefault(); return; }
    if (!document.fullscreenElement) $("#player-close").click();
    return;
  }
  const acao = acoes[tecla];
  if (!acao) return;
  if (alvo === posicao && (tecla === "ArrowLeft" || tecla === "ArrowRight")) return; // o próprio controle trata
  evento.preventDefault();
  acao();
  mostrar();
});
