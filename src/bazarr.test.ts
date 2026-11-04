import assert from "node:assert/strict";
import test from "node:test";
import { LegendasBazarr } from "./bazarr.js";

const historico: Record<string, unknown> = {
  movies: { data: [
    { action: 1, language: { code2: "pb" }, subtitles_path: "/jellyfin/Filmes/Interstellar (2014)/Interestelar.pt-BR.srt" },
    { action: 0, language: { code2: "pb" }, subtitles_path: "/jellyfin/Filmes/Apagado (2020)/Apagado.pt-BR.srt" },
    { action: 1, language: { code2: "pb" }, subtitles_path: "/outro/lugar/x.pt-BR.srt" }
  ] },
  episodes: { data: [{ action: 3, language: { code2: "pb" }, subtitles_path: "/jellyfin/Animes/Daemons/Season 01/E01.pt-BR.srt" }] }
};

test("PQA-266: legenda baixada pelo Bazarr aparece como \"Bazarr - PT-BR\"", async () => {
  const pedidos: string[] = [];
  const bazarr = new LegendasBazarr({
    url: "http://bazarr:6767", chave: "segredo", raizBazarr: "/jellyfin", raizLocal: "/media",
    busca: async (url, opcoes) => {
      pedidos.push(url);
      assert.equal(opcoes.headers["X-API-KEY"], "segredo");
      const tipo = url.includes("/api/movies/") ? "movies" : "episodes";
      return { ok: true, status: 200, json: async () => historico[tipo] };
    }
  });

  assert.equal(await bazarr.sincronizar(), 2, "ignora remoção (ação 0) e caminho fora da biblioteca");
  assert.equal(pedidos.length, 2);

  const base = { id: "a", language: "pt-BR" as const, label: "Português (Brasil)" };
  assert.equal(bazarr.rotular({ ...base, path: "/media/Filmes/Interstellar (2014)/Interestelar.pt-BR.srt" }).label, "Bazarr - PT-BR");
  assert.equal(bazarr.rotular<import("./types.js").Subtitle>({ ...base, path: "/media/Animes/Daemons/Season 01/E01.pt-BR.srt" }).origem, "bazarr");
  assert.equal(bazarr.rotular({ ...base, path: "/media/Filmes/Apagado (2020)/Apagado.pt-BR.srt" }).label, "Português (Brasil)");
});

test("PQA-266: Bazarr fora do ar mantém os rótulos anteriores", async () => {
  let chamadas = 0;
  const bazarr = new LegendasBazarr({
    url: "http://bazarr:6767", chave: "k", raizBazarr: "/jellyfin", raizLocal: "/media",
    busca: async (url) => {
      chamadas++;
      if (chamadas > 2) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => historico[url.includes("/api/movies/") ? "movies" : "episodes"] };
    }
  });
  await bazarr.sincronizar();
  await assert.rejects(bazarr.sincronizar(), /503/);
  const legenda = { id: "a", language: "pt-BR" as const, label: "x", path: "/media/Filmes/Interstellar (2014)/Interestelar.pt-BR.srt" };
  assert.equal(bazarr.rotular(legenda).label, "Bazarr - PT-BR");
});
