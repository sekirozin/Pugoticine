import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { getProfile } from "./auth.js";
import { Catalog } from "./catalog.js";
import { config } from "./config.js";
import { streamFile, subtitleToVtt } from "./media.js";
import { MetadataCatalog } from "./metadata.js";
import { Tmdb } from "./tmdb.js";
import { LegendasBazarr } from "./bazarr.js";
import { Organizador } from "./organizador.js";
import { createPlaybackPlan } from "./playback.js";
import { ProbeService } from "./probe.js";
import { Imagens, type TipoImagem } from "./imagens.js";
import { Store } from "./store.js";
import { BancoPainel } from "./painel/banco.js";
import { GerenciadorBibliotecas } from "./painel/bibliotecas.js";
import { Backups, aplicarRestauracaoPendente } from "./painel/backups.js";
import { Registros } from "./painel/registros.js";
import { RotasPainel } from "./painel/rotas.js";
import { Transcoder } from "./transcoder.js";
import { GerenciadorHls } from "./reproducao/hls.js";
import { CacheKeyframes } from "./reproducao/keyframes.js";
import { detectarVaapi, type Aceleracao } from "./reproducao/aceleracao.js";
import type { OpcoesConversao } from "./reproducao/hls.js";
import { GerenciadorSalas } from "./salas/salas.js";
import { RotasSalas } from "./salas/rotas.js";
import type { PlaybackPlan, PlaybackRequest, PugotiProfile, MediaItem } from "./types.js";

fs.mkdirSync(config.dataDir, { recursive: true });
// Painel › Registros: o que o processo escreve no console também vai para data/registros/log_AAAAMMDD.log.
const registros = new Registros(path.join(config.dataDir, "registros"));
registros.instalar();
// Painel › Backups: restauração agendada é aplicada aqui, antes de qualquer banco ser aberto.
const fontesBackup = [{ nome: "pugoticine.db", arquivo: config.dbFile }, { nome: "painel.db", arquivo: path.join(config.dataDir, "painel.db") },
  { nome: "salas.db", arquivo: path.join(config.dataDir, "salas.db") }];
const restaurado = aplicarRestauracaoPendente(path.join(config.dataDir, "restauracao-pendente"), fontesBackup);
if (restaurado) console.warn(`Backup restaurado: ${restaurado.backup} (${restaurado.arquivos.join(", ")}). Backup de segurança: ${restaurado.seguranca}.`);
// Painel › Bibliotecas: o catálogo é a soma das bibliotecas (a padrão é MEDIA_ROOT, com os IDs de sempre).
const bancoPainel = new BancoPainel(path.join(config.dataDir, "painel.db"));
if (bancoPainel.migrarNomeAntigo()) console.log("Nome do servidor atualizado para Pugoticine.");
if (restaurado) bancoPainel.registrar("BackupRestored", `Backup restaurado: ${restaurado.backup}`, null, `Backup de segurança: ${restaurado.seguranca}`, "Warning");
const raizesPermitidas = (process.env.PUGOTICINE_PASTAS_PERMITIDAS ?? "/media").split(",").map(r => path.resolve(r.trim())).filter(Boolean);
const catalog = new GerenciadorBibliotecas(bancoPainel.db, config.mediaRoot, raizesPermitidas, () => { lastScanAt = new Date().toISOString(); });
const store = new Store(config.dbFile);
// Metadados em português do TMDB (mesma chave do Pugotilist), por cima do Radarr. Sem chave, só Radarr.
const tmdb = config.tmdbToken ? new Tmdb(config.tmdbToken, path.join(config.dataDir, "tmdb-cache.json"), config.tmdbApiUrl) : null;
const metadata = new MetadataCatalog(tmdb);
// Organizador: downloads feitos à mão no Transmission vão para Filmes/Séries/Animes via Radarr/Sonarr.
const organizador = config.organizadorToken && config.radarrUrl && config.sonarrUrl && config.tmdbToken ? new Organizador({
  radarr: { url: config.radarrUrl, chave: config.radarrApiKey }, sonarr: { url: config.sonarrUrl, chave: config.sonarrApiKey },
  transmission: { url: config.transmissionUrl, usuario: config.transmissionUsuario, senha: config.transmissionSenha },
  tmdb: { url: config.tmdbApiUrl, token: config.tmdbToken }, raizes: config.organizadorRaizes,
  registrar: (resumo, detalhe, nivel) => bancoPainel.registrar("Organizador", resumo, null, detalhe, nivel)
}) : null;
/** POST /api/organizador/concluido (script do Transmission): token próprio, só pastas manuais de downloads concluídos. */
async function rotaOrganizador(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const esperado = Buffer.from(config.organizadorToken);
  if (!organizador || !token || token.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(token), esperado)) { json(res, 401, { error: "Token inválido." }); return; }
  const corpo = await body<{ pasta?: string; hash?: string; nome?: string }>(req);
  const raiz = path.resolve(config.organizadorPasta);
  const pasta = path.resolve(String(corpo.pasta ?? ""));
  const relativo = path.relative(raiz, pasta);
  // Fora da pasta de concluídos, ou dentro das pastas do próprio Radarr/Sonarr/música: não mexe.
  if (!corpo.pasta || relativo.startsWith("..") || path.isAbsolute(relativo) || !relativo || /^(radarr|tv-sonarr|music)([\\/]|$)/i.test(relativo)) {
    json(res, 200, { aceito: false, motivo: "fora das pastas de downloads manuais" }); return;
  }
  json(res, 202, { aceito: true });
  void organizador.organizar({ pasta, hash: corpo.hash ? String(corpo.hash) : undefined, nome: corpo.nome ? String(corpo.nome) : undefined });
}

const bazarr = config.bazarrUrl && config.bazarrApiKey
  ? new LegendasBazarr({ url: config.bazarrUrl, chave: config.bazarrApiKey, raizBazarr: config.bazarrRaiz, raizLocal: config.bazarrRaizLocal })
  : null;
/** Lê o histórico do Bazarr (em segundo plano) para rotular as legendas que ele baixou. */
function sincronizarBazarr(): void {
  bazarr?.sincronizar().then(() => {
    // Legenda nova do Bazarr que o catálogo ainda não conhece: varre já, sem esperar a varredura agendada.
    const conhecidas = new Set(catalog.list().flatMap((item) => item.subtitles.map((legenda) => path.resolve(legenda.path))));
    const faltando = bazarr.novas.filter((caminho) => !conhecidas.has(caminho));
    if (faltando.length) { console.log(`Bazarr: ${faltando.length} legenda(s) nova(s); atualizando o catálogo.`); scan(); }
  }).catch((erro) => console.error("Falha ao ler o histórico do Bazarr:", erro instanceof Error ? erro.message : erro));
}

/**
 * "Assistindo no Pugoticine" para o resumo do Pugoti Profile: o que a pessoa começou e não terminou (até 8, mais
 * recentes primeiro). Só o auth chama (token próprio, rede interna); não depende da sessão de quem vê o perfil.
 */
async function rotaResumo(req: IncomingMessage, res: ServerResponse, username: string): Promise<void> {
  const token = String(req.headers["x-pugotilab-resumo"] ?? "");
  const esperado = Buffer.from(config.resumoToken);
  if (!config.resumoToken || token.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(token), esperado)) { json(res, 401, { error: "Token inválido." }); return; }
  const itens = store.listProgress(username.toLowerCase())
    .filter((p) => !p.completed && p.duration > 0 && p.position > 30 && p.position / p.duration < 0.95)
    .map((p) => ({ p, item: catalog.get(p.mediaId) }))
    .filter((x): x is { p: typeof x.p; item: NonNullable<typeof x.item> } => Boolean(x.item))
    .slice(0, 8)
    .map(({ p, item }) => {
      const media = metadata.enrich(item);
      const serie = item.serie;
      const titulo = serie ? media.title.split(" · ")[0] || serie.nome : media.title;
      const faltam = Math.max(1, Math.round((p.duration - p.position) / 60));
      const episodio = serie ? `T${serie.temporada}E${String(serie.episodio).padStart(2, "0")}${serie.nomeEpisodio ? ` · ${serie.nomeEpisodio}` : ""} · ` : "";
      return {
        title: titulo,
        detail: `${episodio}faltam ${faltam} min`,
        percent: Math.round((p.position / p.duration) * 100),
        imageUrl: `${config.enderecoPublico}/api/media/${item.id}/imagem/poster?v=${imagens.versao(media as unknown as MediaItem, media.metadata?.posterUrl ?? "")}&l=342`,
        url: `${config.enderecoPublico}/`,
        updatedAt: p.updatedAt
      };
    });
  json(res, 200, { watching: itens });
}

/** Busca no TMDB o que ainda não está no cache (em segundo plano). */
function sincronizarTmdb(): void {
  if (!tmdb) return;
  tmdb.sincronizar(catalog.list().map((item) => metadata.enrich(item))).catch((erro) => console.error("Falha ao atualizar metadados do TMDB:", erro));
}
const probe = new ProbeService(path.join(config.dataDir, "probe-cache.json"));
// Pôsteres e fundos em WebP no tamanho certo (Radarr ou um quadro do próprio vídeo), em cache.
const imagens = new Imagens(path.join(config.dataDir, "imagens"), config.ffmpegPath, (media) => { try { return probe.analyze(media).duration; } catch { return 0; } });
const transcoder = new Transcoder(path.join(config.dataDir, "transcodes"));
fs.mkdirSync(config.dataDir, { recursive: true });
// Aceleração por GPU (VAAPI), como a do Jellyfin: cada dispositivo é testado uma vez; sem GPU ou se o teste falhar,
// software. O dispositivo das variáveis do container é testado já na inicialização (e aparece no registro).
const deteccoesVaapi = new Map<string, Aceleracao | null>();
function aceleracaoPara(dispositivo: string): Aceleracao | null {
  if (!deteccoesVaapi.has(dispositivo)) {
    const detectada = detectarVaapi(config.ffmpegPath, dispositivo);
    deteccoesVaapi.set(dispositivo, detectada);
    console.log(detectada ? `Aceleração de vídeo: VAAPI em ${detectada.dispositivo} (codifica H.264; decodifica ${detectada.decodifica.join(", ") || "nada"}).` : `Aceleração de vídeo: VAAPI pedida, mas ${dispositivo} não codificou H.264; usando software.`);
  }
  return deteccoesVaapi.get(dispositivo) ?? null;
}
if (config.aceleracao === "vaapi") aceleracaoPara(config.dispositivoVaapi);
else console.log("Aceleração de vídeo: desligada (software).");
/** Painel › Reprodução › Transcodificação aplicado a cada FFmpeg iniciado. Antes de a tela ser salva, valem as
 *  variáveis do container (PUGOTICINE_ACELERACAO/PUGOTICINE_VAAPI_DISPOSITIVO) e os padrões do Jellyfin. */
function opcoesConversao(): Partial<OpcoesConversao> {
  const salva = bancoPainel.foiSalva("reproducao-transcodificacao");
  const t = painel.configuracaoReproducao().transcodificacao as Record<string, unknown>;
  const tipo = salva ? t.HardwareAccelerationType : config.aceleracao === "vaapi" ? "vaapi" : "none";
  const dispositivo = salva && t.VaapiDevice ? String(t.VaapiDevice) : config.dispositivoVaapi;
  let aceleracao = tipo === "vaapi" && t.EnableHardwareEncoding !== false ? aceleracaoPara(dispositivo) : null;
  if (aceleracao && salva) {
    const permitidos = Array.isArray(t.HardwareDecodingCodecs) ? t.HardwareDecodingCodecs.map(String) : [];
    aceleracao = { ...aceleracao, decodifica: aceleracao.decodifica.filter(codec => permitidos.includes(codec)) };
  }
  return {
    aceleracao, threads: Number(t.EncodingThreadCount ?? -1), preset: String(t.EncoderPreset ?? "auto"), crf: Number(t.H264Crf ?? 23),
    filaMux: Number(t.MaxMuxingQueueSize ?? 2048), reforcoDownmix: Number(t.DownMixAudioBoost ?? 2),
    limitar: t.EnableThrottling === true, limitarApos: Number(t.ThrottleDelaySeconds ?? 180),
    removerSegmentos: t.EnableSegmentDeletion === true, manterSegundos: Number(t.SegmentKeepSeconds ?? 720)
  };
}
const hls = new GerenciadorHls(path.join(config.dataDir, "hls"), new CacheKeyframes(path.join(config.dataDir, "keyframes.json")), config.ffmpegPath, opcoesConversao);
const salas = new RotasSalas(new GerenciadorSalas(path.join(config.dataDir, "salas.db")), (id) => Boolean(catalog.get(id)), json, body);
let lastScanAt = "";
const versaoApp = JSON.parse(fs.readFileSync(path.join(config.publicDir, "..", "package.json"), "utf8")).version as string;
const painel = new RotasPainel({
  banco: bancoPainel, registros, json, corpo: body, bibliotecas: catalog, raizesPermitidas,
  backups: new Backups(path.join(config.dataDir, "backups"), fontesBackup, versaoApp),
  catalogo: () => catalog.list(), ultimaVarredura: () => lastScanAt, atividadeProgresso: () => store.listActivity(50),
  varrer: async () => { scan(); return catalog.list().length; }, atualizarMetadados: async () => { await metadata.refresh(); await tmdb?.sincronizar(catalog.list().map((item) => metadata.enrich(item))); },
  intervaloMs: config.scanIntervalMs, raizMidia: config.mediaRoot, pastaDados: config.dataDir, ffmpeg: config.ffmpegPath, versao: versaoApp
});

function scan(): void {
  const items = catalog.scan();
  lastScanAt = new Date().toISOString();
  console.log(`Catálogo atualizado: ${items.length} mídia(s).`);
  sincronizarTmdb();
  sincronizarBazarr();
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function body<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as T : {} as T;
}

async function authenticated(req: IncomingMessage, res: ServerResponse): Promise<PugotiProfile | null> {
  // Sem sessão do Pugotilab, vale uma chave do Painel › Chaves da API (acesso de administrador).
  const profile = await getProfile(req) ?? painel.perfilPorChave(req);
  if (!profile) json(res, 401, { error: "Entre com sua conta Pugotilab.", loginUrl: config.pugotilabLoginUrl });
  return profile;
}

// Painel › Usuários › Acesso à biblioteca e Controle dos pais: cada pessoa só vê (e só abre) o que pode.
function publicMedia(profile: PugotiProfile) {
  return catalog.list().map((media) => metadata.enrich(media)).filter((media) => painel.podeVer(profile, media)).map(({ absolutePath: _absolutePath, ...item }) => ({
    ...item,
    subtitles: bazarr ? item.subtitles.map((legenda) => bazarr.rotular(legenda)) : item.subtitles,
    // Endereços versionados das imagens; o cliente acrescenta &l=<largura> (srcset).
    imagens: {
      poster: `/api/media/${item.id}/imagem/poster?v=${imagens.versao(item as unknown as MediaItem, item.metadata?.posterUrl ?? "")}`,
      fundo: `/api/media/${item.id}/imagem/fundo?v=${imagens.versao(item as unknown as MediaItem, item.metadata?.backdropUrl ?? "")}`,
      cena: `/api/media/${item.id}/imagem/cena?v=${imagens.versao(item as unknown as MediaItem, imagemRemota(item, "cena"))}`
    }
  }));
}
function bibliotecasVisiveis(profile: PugotiProfile) {
  return catalog.bibliotecas().filter((b) => b.ativa && painel.podeVerBiblioteca(profile, b.id)).map(({ id, nome, tipo }) => ({ id, nome, tipo }));
}
/** Imagem de origem: pôster e fundo do filme/série; "cena" é a imagem do episódio (ou o fundo, se não houver). */
function imagemRemota(item: { metadata?: MediaItem["metadata"] }, tipo: TipoImagem): string {
  const m = item.metadata;
  return (tipo === "poster" ? m?.posterUrl : tipo === "fundo" ? m?.backdropUrl : m?.stillUrl || m?.backdropUrl) ?? "";
}
function visivel<T extends { id: string }>(profile: PugotiProfile, media: T | null): T | null {
  return media && painel.podeVer(profile, metadata.enrich(media as never)) ? media : null;
}

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const profile = await authenticated(req, res);
  if (!profile) return;
  const url = new URL(req.url ?? "/", "http://localhost");
  // Painel › Usuários: registra o acesso e bloqueia quem foi desativado.
  const bloqueio = painel.verificarAcesso(profile, req);
  if (bloqueio) { json(res, 403, { error: bloqueio }); return; }
  if (await painel.tratar(req, res, url, profile)) return;
  if (await salas.tratar(req, res, url, profile)) return;

  if (url.pathname === "/api/bootstrap" && req.method === "GET") {
    json(res, 200, { profile, media: publicMedia(profile), bibliotecas: bibliotecasVisiveis(profile), progress: store.listProgress(profile.username), lastScanAt });
    return;
  }
  if (url.pathname === "/api/catalog/scan" && req.method === "POST") {
    if (profile.role !== "admin") { json(res, 403, { error: "Apenas administradores podem atualizar o catálogo." }); return; }
    scan();
    await metadata.refresh();
    json(res, 200, { media: publicMedia(profile), lastScanAt });
    return;
  }
  if (url.pathname === "/api/progress" && req.method === "POST") {
    const input = await body<{ mediaId?: string; position?: number; duration?: number }>(req);
    const media = visivel(profile, catalog.get(String(input.mediaId ?? "")));
    if (!media) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    // Painel › Reprodução › Retomar: a porcentagem máxima decide quando o filme conta como assistido.
    json(res, 200, { progress: store.saveProgress(profile.username, media.id, Number(input.position), Number(input.duration), painel.limiteConcluido()) });
    return;
  }

  // Marcar/desmarcar como assistido: filme, episódio, temporada ou série inteira (o cliente manda os episódios).
  if (url.pathname === "/api/progress/assistido" && req.method === "POST") {
    const input = await body<{ mediaIds?: unknown; assistido?: unknown }>(req);
    const ids = Array.isArray(input.mediaIds) ? input.mediaIds.map(String) : [];
    if (!ids.length || ids.length > 5000 || typeof input.assistido !== "boolean") { json(res, 400, { error: "Informe mediaIds (lista) e assistido (verdadeiro ou falso)." }); return; }
    const medias = ids.map((id) => visivel(profile, catalog.get(id)));
    if (medias.some((m) => !m)) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    json(res, 200, { progress: store.marcarAssistido(profile.username, medias.map((m) => m!.id), input.assistido) });
    return;
  }

  const imagemMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/imagem\/(poster|fundo|cena)$/);
  if (imagemMatch && req.method === "GET") {
    const base = visivel(profile, catalog.get(imagemMatch[1]));
    if (!base) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    const media = metadata.enrich(base);
    const tipo = imagemMatch[2] as TipoImagem;
    const remota = imagemRemota(media, tipo);
    const arquivo = await imagens.caminho(media, tipo, Number(url.searchParams.get("l")) || 500, remota);
    const atual = url.searchParams.get("v") === imagens.versao(media, remota);
    res.writeHead(200, { "content-type": "image/webp", "content-length": fs.statSync(arquivo).size, "cache-control": atual ? "private, max-age=31536000, immutable" : "private, no-cache" });
    fs.createReadStream(arquivo).pipe(res);
    return;
  }
  const playbackMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/playback$/);
  if (playbackMatch && req.method === "POST") {
    const media = visivel(profile, catalog.get(playbackMatch[1]));
    if (!media) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    painel.registrarReproducao(profile, media);
    const request = await body<PlaybackRequest>(req);
    const technical = probe.analyze(media);
    const plan = createPlaybackPlan(media, technical, request);
    if (plan.mode === "direct") {
      json(res, 200, { plan, technical, url: `/api/media/${media.id}/stream` });
      return;
    }
    // HLS sob demanda (como o Jellyfin): playlist completa, segmentos gerados quando pedidos.
    const sessao = hls.criar(profile.username, media, technical, plan);
    json(res, 200, { plan, technical, url: `/api/media/${media.id}/hls/${sessao}/main.m3u8` });
    return;
  }

  const directMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/stream$/);
  if (directMatch && req.method === "GET") {
    const media = visivel(profile, catalog.get(directMatch[1]));
    if (!media) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    streamFile(media.absolutePath, req.headers.range, res);
    return;
  }
  const subtitleMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/subtitles\/([a-f0-9]{24})\.vtt$/);
  if (subtitleMatch && req.method === "GET") {
    const subtitle = visivel(profile, catalog.get(subtitleMatch[1]))?.subtitles.find((item) => item.id === subtitleMatch[2]);
    if (!subtitle) { json(res, 404, { error: "Legenda não encontrada." }); return; }
    res.writeHead(200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=3600" });
    res.end(subtitleToVtt(subtitle.path));
    return;
  }
  const embeddedSubtitleMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/embedded-subtitles\/(\d+)\.vtt$/);
  if (embeddedSubtitleMatch && req.method === "GET") {
    const media = visivel(profile, catalog.get(embeddedSubtitleMatch[1]));
    if (!media) { json(res, 404, { error: "Mídia não encontrada." }); return; }
    const technical = probe.analyze(media);
    const streamIndex = Number(embeddedSubtitleMatch[2]);
    const subtitle = technical.subtitleTracks.find((track) => track.streamIndex === streamIndex && track.kind === "text");
    if (!subtitle) { json(res, 404, { error: "Legenda interna não encontrada ou incompatível." }); return; }
    res.writeHead(200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=3600" });
    const process = transcoder.textSubtitleProcess(media, streamIndex);
    process.stdout?.pipe(res);
    process.stderr?.on("data", (chunk) => console.error(`Falha na legenda de ${media.title}: ${String(chunk).trim()}`));
    res.once("close", () => { if (process.exitCode === null) process.kill("SIGTERM"); });
    return;
  }
  const hlsMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/hls\/([0-9a-f-]{36})\/(main\.m3u8|init\.mp4|\d{1,6}\.mp4)$/);
  if (hlsMatch && req.method === "GET") {
    const sessao = hls.sessao(hlsMatch[2], profile.username, hlsMatch[1]);
    if (!sessao) { json(res, 403, { error: "Sessão de reprodução inválida ou expirada." }); return; }
    if (hlsMatch[3] === "main.m3u8") {
      res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" });
      res.end(hls.playlist(sessao));
      return;
    }
    const numero = hlsMatch[3] === "init.mp4" ? -1 : Number(hlsMatch[3].slice(0, -4));
    const arquivo = await hls.segmento(sessao, numero);
    const tamanho = fs.statSync(arquivo).size;
    res.writeHead(200, { "content-type": "video/mp4", "content-length": tamanho, "cache-control": "private, no-store" });
    fs.createReadStream(arquivo).pipe(res);
    return;
  }
  const stopHlsMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})\/hls$/);
  if (stopHlsMatch && req.method === "DELETE") {
    hls.encerrarDoUsuario(profile.username, stopHlsMatch[1]);
    transcoder.stopSession(profile.username, stopHlsMatch[1]);
    json(res, 200, { stopped: true });
    return;
  }
  json(res, 404, { error: "Rota não encontrada." });
}

async function staticFile(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = requested === "vendor/hls.min.js" ? config.vendorHlsFile : path.resolve(config.publicDir, requested);
  if (requested !== "vendor/hls.min.js" && !file.startsWith(config.publicDir)) { res.writeHead(403).end(); return; }
  try {
    const data = await fsPromises.readFile(file);
    const extension = path.extname(file);
    const contentType = extension === ".html" ? "text/html; charset=utf-8"
      : extension === ".css" ? "text/css; charset=utf-8"
        : extension === ".js" ? "text/javascript; charset=utf-8"
          : extension === ".svg" ? "image/svg+xml" : extension === ".png" ? "image/png"
            : extension === ".webmanifest" ? "application/manifest+json; charset=utf-8" : "application/octet-stream";
    res.writeHead(200, { "content-type": contentType, "cache-control": extension === ".svg" ? "public, max-age=86400" : "no-cache" });
    res.end(data);
  } catch {
    const index = await fsPromises.readFile(path.join(config.publicDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    res.end(index);
  }
}

scan();
metadata.refresh().catch((error) => console.error("Falha ao atualizar metadados:", error)).finally(sincronizarTmdb);
// Painel › Tarefas Agendadas: os gatilhos de cada tarefa (padrão: varredura e metadados a cada SCAN_INTERVAL_MS)
// são verificados pelo agendador, como o TaskManager do Jellyfin.
painel.iniciarAgendador();
// Legendas novas do Bazarr aparecem com o rótulo certo sem esperar a próxima varredura.
if (bazarr) setInterval(sincronizarBazarr, 5 * 60 * 1000).unref();
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/health") { json(res, 200, { status: "ok", media: catalog.list().length, lastScanAt }); return; }
    if (req.url === "/api/organizador/concluido" && req.method === "POST") { await rotaOrganizador(req, res); return; }
    const resumo = req.url?.match(/^\/api\/pugotilab\/assistindo\/([a-z0-9._-]{1,64})$/i);
    if (resumo && req.method === "GET") { await rotaResumo(req, res, resumo[1]); return; }
    const rede = painel.acessoDeRede(req);
    if (!rede.permitido) { res.writeHead(403, { "content-type": "text/plain; charset=utf-8" }); res.end(`Acesso negado pela configuração de Redes do Pugoticine (${rede.motivo}).`); return; }
    if (req.url?.startsWith("/api/")) {
      const inicio = Date.now();
      await handleApi(req, res);
      // Painel › Registros: aviso de resposta lenta (o vídeo em HLS espera o FFmpeg e fica de fora).
      const limite = painel.respostaLenta();
      const duracao = Date.now() - inicio;
      if (limite !== null && duracao > limite && !/\/hls\//.test(req.url)) console.warn(`Resposta lenta: ${req.method} ${req.url.split("?")[0]} levou ${duracao} ms`);
    }
    else await staticFile(req, res);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error instanceof Error ? error.message : "Erro interno." });
  }
});

function shutdown(): void {
  painel.pararAgendador();
  transcoder.stop();
  hls.parar();
  salas.parar();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.listen(config.port, () => console.log(`Pugoticine rodando em http://localhost:${config.port}`));
