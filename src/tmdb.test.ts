// PQA-227: metadados do TMDB em português, como o provedor TMDb do Jellyfin: filme pela busca (título + ano), série pelo
// ID do tvshow.nfo, episódios com nome/sinopse/cena, sinopse em inglês quando falta a tradução, cache em disco (sem
// rede na segunda vez) e Radarr por baixo (o TMDB só completa/traduz).
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { MetadataCatalog } from "./metadata.js";
import { GerenciadorBibliotecas } from "./painel/bibliotecas.js";
import { Tmdb } from "./tmdb.js";

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "tmdb-"));
const arquivo = (rel: string, conteudo = "x") => { const f = path.join(raiz, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, conteudo); };
arquivo("Filmes/The Matrix (1999)/The.Matrix.1999.1080p.mkv");
arquivo("Filmes/Sem Resultado (2030)/Sem.Resultado.2030.mkv");
arquivo("Animes/Daemons of the Shadow Realm/tvshow.nfo", "<tvshow><title>x</title><tmdbid>260463</tmdbid></tvshow>");
arquivo("Animes/Daemons of the Shadow Realm/Season 1/Daemons.of.the.Shadow.Realm.S01E01.1080p.mkv");
arquivo("Animes/Daemons of the Shadow Realm/Season 1/Daemons.of.the.Shadow.Realm.S01E05.Hare.and.Tortoise.1080p.mkv");
test.after(() => fs.rmSync(raiz, { recursive: true, force: true }));

const pedidos: string[] = [];
const respostas: Record<string, unknown> = {
  "/search/movie": { results: [{ id: 603, title: "Matrix", original_title: "The Matrix", release_date: "1999-03-30" }] },
  "/movie/603": { id: 603, title: "Matrix", original_title: "The Matrix", overview: "Um hacker descobre a verdade.", genres: [{ name: "Ação" }, { name: "Ficção científica" }],
    runtime: 136, vote_average: 8.2, poster_path: "/poster.jpg", backdrop_path: "/fundo.jpg", release_date: "1999-03-30", production_companies: [{ name: "Warner" }],
    release_dates: { results: [{ iso_3166_1: "BR", release_dates: [{ certification: "14" }] }] } },
  "/tv/260463": { id: 260463, name: "Daemons do Reino das Sombras", original_name: "黄泉のツガイ", overview: "", genres: [{ name: "Animação" }], episode_run_time: [24],
    vote_average: 8.7, poster_path: "/p-serie.jpg", backdrop_path: "/f-serie.jpg", first_air_date: "2026-04-04", networks: [{ name: "Tokyo MX" }], production_companies: [],
    content_ratings: { results: [{ iso_3166_1: "BR", rating: "16" }] } },
  "/tv/260463/season/1": { episodes: [
    { episode_number: 1, name: "Episódio 1", overview: "", still_path: null, runtime: 24 },
    { episode_number: 5, name: "Lebre e Tartaruga", overview: "Yuru aceita ir à mansão.", still_path: "/cena5.jpg", runtime: 23 }] }
};
const servidor = http.createServer((req, res) => {
  const url = new URL(req.url!, "http://x");
  pedidos.push(`${url.pathname}?${url.searchParams.get("language") ?? ""}|${req.headers.authorization}`);
  if (url.pathname === "/tv/260463" && url.searchParams.get("language") === "en-US") { res.end(JSON.stringify({ ...respostas["/tv/260463"] as object, overview: "Yuru, a young hunter..." })); return; }
  if (url.pathname === "/search/movie" && url.searchParams.get("query") === "Sem Resultado") { res.end(JSON.stringify({ results: [] })); return; }
  const r = respostas[url.pathname];
  if (!r) { res.writeHead(404); res.end("{}"); return; }
  res.end(JSON.stringify(r));
});

test("PQA-227: filmes e séries com metadados do TMDB em português, com cache", async () => {
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
  try {
    const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    const g = new GerenciadorBibliotecas(new Database(":memory:"), path.join(raiz, "Filmes"), [raiz]);
    g.scan(); g.criar({ nome: "Animes", tipo: "tvshows", pastas: [path.join(raiz, "Animes")] });
    const cache = path.join(raiz, "dados", "tmdb-cache.json");
    const tmdb = new Tmdb("token-teste", cache, base, "https://img.exemplo");
    const meta = new MetadataCatalog(tmdb);
    await tmdb.sincronizar(g.list().map((i) => meta.enrich(i)));
    assert.ok(pedidos.every((p) => p.endsWith("|Bearer token-teste")), "autenticado com o token");

    const filme = meta.enrich(g.list().find((i) => i.relativePath.startsWith("The Matrix"))!);
    assert.equal(filme.title, "Matrix");
    assert.equal(filme.year, 1999);
    assert.deepEqual([filme.metadata?.overview, filme.metadata?.genres, filme.metadata?.runtime, filme.metadata?.certification, filme.metadata?.audienceScore],
      ["Um hacker descobre a verdade.", ["Ação", "Ficção científica"], 136, "14", 82]);
    assert.equal(filme.metadata?.posterUrl, "https://img.exemplo/w780/poster.jpg");
    assert.equal(filme.metadata?.backdropUrl, "https://img.exemplo/original/fundo.jpg");
    const semResultado = meta.enrich(g.list().find((i) => i.relativePath.startsWith("Sem Resultado"))!);
    assert.equal(semResultado.metadata, undefined, "sem resultado: continua sem metadados (quadro do vídeo)");

    const eps = g.list().filter((i) => i.bibliotecaNome === "Animes").map((i) => meta.enrich(i)).sort((a, b) => a.serie!.episodio - b.serie!.episodio);
    assert.ok(!pedidos.some((p) => p.startsWith("/search/tv")), "série identificada pelo tvshow.nfo, sem busca");
    assert.deepEqual(eps.map((e) => e.serie!.nome), ["Daemons do Reino das Sombras", "Daemons do Reino das Sombras"]);
    assert.equal(eps[1].title, "Daemons do Reino das Sombras · T1E05");
    assert.equal(eps[1].serie!.nomeEpisodio, "Lebre e Tartaruga", "nome do episódio em português");
    assert.equal(eps[0].serie!.nomeEpisodio, null, "nome genérico do TMDB e arquivo sem nome: fica sem nome");
    assert.equal(eps[1].metadata?.episodeOverview, "Yuru aceita ir à mansão.");
    assert.equal(eps[1].metadata?.stillUrl, "https://img.exemplo/original/cena5.jpg");
    assert.equal(eps[0].metadata?.overview, "Yuru, a young hunter...", "sem tradução: sinopse em inglês");
    assert.deepEqual([eps[0].metadata?.year, eps[0].metadata?.posterUrl, eps[0].metadata?.certification], [2026, "https://img.exemplo/w780/p-serie.jpg", "16"]);

    // Cache: outra instância não vai à rede.
    const antes = pedidos.length;
    const outra = new Tmdb("token-teste", cache, base, "https://img.exemplo");
    await outra.sincronizar(g.list().map((i) => meta.enrich(i)));
    assert.equal(pedidos.length, antes, "segunda vez vem do cache em disco");
    assert.equal(new MetadataCatalog(outra).enrich(g.list().find((i) => i.relativePath.startsWith("The Matrix"))!).title, "Matrix");
  } finally { servidor.close(); }
});
