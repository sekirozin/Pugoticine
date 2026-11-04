// PQA-229: downloads colados à mão no Transmission vão sozinhos para Filmes/Séries/Animes: classificação pelo nome,
// título achado no TMDB, cadastro no Radarr/Sonarr (sem monitorar nem buscar) na raiz certa (animação japonesa =
// Animes), importação manual movendo os arquivos, torrent removido só quando todos os vídeos foram importados; o
// script do Transmission manda o JSON certo e ignora os downloads do próprio Radarr/Sonarr.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { classificar, Organizador } from "./organizador.js";

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "organizador-"));
const completo = path.join(raiz, "complete");
const biblioteca = path.join(raiz, "jellyfin");
const criar = (rel: string) => { const f = path.join(completo, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, "video"); return f; };
test.after(() => fs.rmSync(raiz, { recursive: true, force: true }));

type Req = { metodo: string; caminho: string; corpo: any; cabecalhos: http.IncomingHttpHeaders };
const pedidos: Req[] = [];
let filmes: any[] = [{ id: 1, title: "Interstellar", year: 2014, tmdbId: 157336, qualityProfileId: 10 }];
let series: any[] = [{ id: 1, title: "Cowboy Bebop", tvdbId: 76885, qualityProfileId: 11, seriesType: "anime" }];
const removidos: string[] = [];
let sessao = "";

function servidor(responder: (r: Req, res: http.ServerResponse) => unknown) {
  return http.createServer((req, res) => {
    let dados = "";
    req.on("data", (d) => { dados += d; });
    req.on("end", () => {
      const url = new URL(req.url!, "http://x");
      const r: Req = { metodo: req.method!, caminho: url.pathname + url.search, corpo: dados ? JSON.parse(dados) : null, cabecalhos: req.headers };
      pedidos.push(r);
      const saida = responder(r, res);
      if (saida !== undefined) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(saida)); }
    });
  });
}
/** Simula o "move" do Radarr/Sonarr: tira o arquivo da pasta de downloads e põe na biblioteca. */
function mover(arquivos: { path: string }[], destino: string) {
  for (const a of arquivos) { fs.mkdirSync(destino, { recursive: true }); fs.renameSync(a.path, path.join(destino, path.basename(a.path))); }
}
const radarr = servidor((r, res) => {
  if (r.caminho === "/api/v3/movie" && r.metodo === "GET") return filmes;
  if (r.caminho.startsWith("/api/v3/movie/lookup/tmdb")) return { title: "Resident Evil", year: 2026, tmdbId: 999, images: [] };
  if (r.caminho === "/api/v3/movie" && r.metodo === "POST") { const f = { ...r.corpo, id: 2 }; filmes.push(f); return f; }
  if (r.caminho.startsWith("/api/v3/manualimport")) {
    // Como o Radarr 6 real: com movieId de filme sem pasta na biblioteca, erro 500.
    if (/movieId=/.test(r.caminho)) { res.writeHead(500); res.end(JSON.stringify({ message: "Could not find a part of the path" })); return undefined; }
    const pasta = decodeURIComponent(r.caminho.match(/folder=([^&]+)/)![1]);
    const lista = fs.statSync(pasta).isFile() ? [pasta] : fs.readdirSync(pasta).map((n) => path.join(pasta, n)).filter((f) => f.endsWith(".mkv"));
    return lista.map((p) => ({ path: p, quality: { q: 1 }, languages: [{ id: 1 }], releaseGroup: "G", folderName: path.basename(pasta) }));
  }
  if (r.caminho === "/api/v3/command" && r.metodo === "POST") { mover(r.corpo.files, path.join(biblioteca, "Filmes", `filme-${r.corpo.files[0].movieId}`)); return { id: 7 }; }
  if (r.caminho === "/api/v3/command/7") return { status: "completed" };
  return { erro: r.caminho };
});
const sonarr = servidor((r, res) => {
  if (r.caminho === "/api/v3/series" && r.metodo === "GET") return series;
  if (r.caminho.startsWith("/api/v3/series/lookup")) return [{ title: "The Exiled Heavy Knight", tvdbId: 444, seasons: [] }];
  if (r.caminho === "/api/v3/series" && r.metodo === "POST") { const s = { ...r.corpo, id: 3 }; series.push(s); return s; }
  if (r.caminho.startsWith("/api/v3/manualimport")) {
    // Série recém-cadastrada sem pasta: com seriesId falha (cai na tentativa sem ID).
    if (/seriesId=3/.test(r.caminho)) { res.writeHead(500); res.end("{}"); return undefined; }
    const pasta = decodeURIComponent(r.caminho.match(/folder=([^&]+)/)![1]);
    const lista = fs.statSync(pasta).isFile() ? [pasta] : fs.readdirSync(pasta).map((n) => path.join(pasta, n)).filter((f) => f.endsWith(".mkv"));
    // O episódio "sem-marca" não é reconhecido (fica pendente).
    return lista.map((p, i) => ({ path: p, seasonNumber: 1, episodes: /sem-marca/.test(p) ? [] : [{ id: 100 + i }], quality: {}, languages: [] }));
  }
  if (r.caminho === "/api/v3/command" && r.metodo === "POST") { mover(r.corpo.files, path.join(biblioteca, "Animes", `serie-${r.corpo.files[0].seriesId}`)); return { id: 8 }; }
  if (r.caminho === "/api/v3/command/8") return { status: "completed" };
  return { erro: r.caminho };
});
const tmdb = servidor((r) => {
  if (r.caminho.startsWith("/search/movie")) return /Interestelar/.test(decodeURIComponent(r.caminho)) ? { results: [{ id: 157336, title: "Interestelar", original_title: "Interstellar", release_date: "2014-11-05" }] }
    : { results: [{ id: 999, title: "Resident Evil", original_title: "Resident Evil", release_date: "2026-09-18" }] };
  if (r.caminho.startsWith("/search/tv")) return { results: [{ id: 555, name: "The Exiled Heavy Knight Knows How to Game the System", original_name: "追放された転生重騎士", genre_ids: [16, 10759], original_language: "ja" }] };
  if (r.caminho.startsWith("/tv/555/external_ids")) return { tvdb_id: 444 };
  return { erro: r.caminho };
});
const transmission = servidor((r, res) => {
  if (r.cabecalhos["x-transmission-session-id"] !== "sessao-1") { sessao = "sessao-1"; res.writeHead(409, { "X-Transmission-Session-Id": sessao }); res.end(); return undefined; }
  if (r.corpo.method === "torrent-get") return { result: "success", arguments: { torrents: [{ hashString: "abc", name: "Interestelar 2014 [1080p] WWW.BLUDV.COM", downloadDir: completo }] } };
  if (r.corpo.method === "torrent-remove") { removidos.push(...r.corpo.arguments.ids); return { result: "success", arguments: {} }; }
  return { result: "erro" };
});
const ouvir = async (s: http.Server) => { await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r())); return `http://127.0.0.1:${(s.address() as { port: number }).port}`; };

test("PQA-229: classificação dos nomes de torrent", () => {
  const casos: [string, string, string, number | null][] = [
    ["Interestelar 2014 [1080p] WWW.BLUDV.COM", "filme", "Interestelar", 2014],
    ["Resident.Evil.2026.1080p.WEB-DL.x264.DUAL.5.1", "filme", "Resident Evil", 2026],
    ["Homem-Aranha - Um Novo Dia 2026 WEB-DL 1080p x264 DUAL 5.1", "filme", "Homem-Aranha - Um Novo Dia", 2026],
    ["[SubsPlease] Tsuihou sareta Tensei Juukishi - 18 (1080p) [40D7BDB9].mkv", "serie", "Tsuihou sareta Tensei Juukishi", null],
    ["Daemons.of.the.Shadow.Realm.S01E11.Big.Brother.1080p.mkv", "serie", "Daemons of the Shadow Realm", null],
    ["The Boys S04 1080p WEB-DL", "serie", "The Boys", null],
    ["Cowboy Bebop Season 1", "serie", "Cowboy Bebop", null]
  ];
  for (const [nome, tipo, titulo, ano] of casos) assert.deepEqual(classificar(`/x/${nome}`, [`/x/${nome}/a.mkv`]), { tipo, nome: titulo, ano }, nome);
});

test("PQA-229: filme conhecido, filme novo e anime novo vão para a biblioteca; torrent removido só se tudo foi importado", async () => {
  const [ur, us, ut, utr] = await Promise.all([ouvir(radarr), ouvir(sonarr), ouvir(tmdb), ouvir(transmission)]);
  try {
    const avisos: string[] = [];
    const o = new Organizador({ radarr: { url: ur, chave: "kr" }, sonarr: { url: us, chave: "ks" }, transmission: { url: utr, usuario: "u", senha: "s" },
      tmdb: { url: ut, token: "tk" }, raizes: { filmes: "/jellyfin/Filmes", series: "/jellyfin/Séries", animes: "/jellyfin/Animes" },
      registrar: (resumo, _d, nivel) => avisos.push(`${nivel}: ${resumo}`), esperaComandoMs: 5000 });

    // 1. Filme que o Radarr já tem (Interstellar): importa, acha o torrent pelo nome e remove (com as sobras).
    const pastaInter = path.join(completo, "Interestelar 2014 [1080p] WWW.BLUDV.COM");
    criar("Interestelar 2014 [1080p] WWW.BLUDV.COM/Interestelar.2014.1080p.BluRay.mkv");
    fs.writeFileSync(path.join(pastaInter, "BLUDV ACESSE.url"), "x");
    const r1 = await o.organizar({ pasta: pastaInter });
    assert.deepEqual([r1.tipo, r1.titulo, r1.importados, r1.pendentes, r1.torrentRemovido], ["filme", "Interstellar (2014)", 1, [], true]);
    assert.deepEqual(removidos, ["abc"]);
    const remover = pedidos.find((p) => p.corpo?.method === "torrent-remove");
    assert.equal(remover!.corpo.arguments["delete-local-data"], true, "apaga as sobras (.url)");
    assert.equal(remover!.cabecalhos.authorization, `Basic ${Buffer.from("u:s").toString("base64")}`);
    const importacao = pedidos.find((p) => p.caminho === "/api/v3/command" && p.corpo.files[0].movieId === 1)!;
    assert.equal(importacao.corpo.importMode, "move");
    assert.ok(!pedidos.some((p) => p.caminho === "/api/v3/movie" && p.metodo === "POST"), "não recadastra filme existente");

    // 2. Filme novo (Resident Evil 2026): cadastra no Radarr sem monitorar/buscar, na raiz Filmes, com o perfil mais usado.
    const r2 = await o.organizar({ pasta: path.dirname(criar("Resident.Evil.2026.1080p.WEB-DL.x264.DUAL.5.1/Resident.Evil.2026.1080p.mkv")), hash: "def" });
    const cadastro = pedidos.find((p) => p.caminho === "/api/v3/movie" && p.metodo === "POST")!.corpo;
    assert.deepEqual([cadastro.tmdbId, cadastro.rootFolderPath, cadastro.monitored, cadastro.addOptions.searchForMovie, cadastro.qualityProfileId], [999, "/jellyfin/Filmes", false, false, 10]);
    assert.deepEqual([r2.titulo, r2.torrentRemovido], ["Resident Evil (2026)", true]);
    assert.deepEqual(removidos, ["abc", "def"]);

    // 3. Anime novo com um episódio que o Sonarr não reconhece: importa o que dá e NÃO remove o torrent.
    const pastaAnime = path.join(completo, "The Exiled Heavy Knight S01 1080p");
    criar("The Exiled Heavy Knight S01 1080p/The.Exiled.Heavy.Knight.S01E01.1080p.mkv");
    criar("The Exiled Heavy Knight S01 1080p/sem-marca.mkv");
    const r3 = await o.organizar({ pasta: pastaAnime, hash: "ghi" });
    const serie = pedidos.find((p) => p.caminho === "/api/v3/series" && p.metodo === "POST")!.corpo;
    assert.deepEqual([serie.rootFolderPath, serie.seriesType, serie.monitored, serie.addOptions.searchForMissingEpisodes, serie.qualityProfileId], ["/jellyfin/Animes", "anime", false, false, 11]);
    assert.deepEqual([r3.tipo, r3.importados, r3.pendentes.map((p) => path.basename(p)), r3.torrentRemovido], ["anime", 1, ["sem-marca.mkv"], false]);
    assert.deepEqual(removidos, ["abc", "def"], "com pendência o torrent fica");
    assert.ok(avisos.some((a) => /^Warning: .*1 arquivo\(s\) não importado/.test(a)), avisos.join(" | "));
    assert.ok(pedidos.filter((p) => p.cabecalhos["x-api-key"]).every((p) => ["kr", "ks"].includes(String(p.cabecalhos["x-api-key"]))));
  } finally { radarr.close(); sonarr.close(); tmdb.close(); transmission.close(); }
});

test("PQA-229: script do Transmission manda o JSON certo e ignora os downloads do Radarr/Sonarr", async () => {
  const recebidos: { corpo: string; auth?: string }[] = [];
  const alvo = http.createServer((req, res) => { let d = ""; req.on("data", (x) => { d += x; }); req.on("end", () => { recebidos.push({ corpo: d, auth: req.headers.authorization }); res.end("{}"); }); });
  const url = await ouvir(alvo);
  try {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "script-"));
    const script = path.join(pasta, "pugoticine-concluido.sh");
    fs.copyFileSync(path.resolve("integracoes/transmission/pugoticine-concluido.sh"), script);
    fs.writeFileSync(path.join(pasta, "pugoticine-organizador.token"), "segredo\n");
    const rodar = (dir: string, nome: string) => spawnSync("sh", [script], { env: { ...process.env, PUGOTICINE_ORGANIZADOR_URL: `${url}/api/organizador/concluido`, TR_TORRENT_DIR: dir, TR_TORRENT_NAME: nome, TR_TORRENT_HASH: "h1" } });
    rodar("/data/Downloads/complete", 'Filme "Aspas" \\ Barra (2020)');
    rodar("/data/Downloads/complete/radarr", "Gerenciado pelo Radarr");
    rodar("/data/Downloads/complete/tv-sonarr", "Gerenciado pelo Sonarr");
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(recebidos.length, 1, "só o download manual");
    assert.equal(recebidos[0].auth, "Bearer segredo");
    assert.deepEqual(JSON.parse(recebidos[0].corpo), { pasta: '/data/Downloads/complete/Filme "Aspas" \\ Barra (2020)', hash: "h1", nome: 'Filme "Aspas" \\ Barra (2020)' });
    fs.rmSync(pasta, { recursive: true, force: true });
  } finally { alvo.close(); }
});
