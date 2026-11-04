import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanCatalog } from "./catalog.js";

test("monta catálogo e associa legendas", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pugoticine-"));
  const movie = path.join(root, "Filme Exemplo (2026)");
  fs.mkdirSync(movie);
  fs.writeFileSync(path.join(movie, "filme.mp4"), "video");
  fs.writeFileSync(path.join(movie, "filme.pt-BR.srt"), "1\n00:00:00,000 --> 00:00:01,000\nOi");
  fs.writeFileSync(path.join(movie, ".filme.tmp.mkv"), "temp");

  const catalog = scanCatalog(root);

  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]?.title, "Filme Exemplo");
  assert.equal(catalog[0]?.year, 2026);
  assert.equal(catalog[0]?.subtitles[0]?.language, "pt-BR");
});

test("PQA-265: episódios da mesma pasta recebem só as próprias legendas", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pugoticine-"));
  const temporada = path.join(root, "Série (2026)", "Season 01");
  fs.mkdirSync(temporada, { recursive: true });
  for (const ep of ["Serie.S01E01", "Serie.S01E02", "Serie.S01E10"]) fs.writeFileSync(path.join(temporada, `${ep}.mkv`), "video");
  fs.writeFileSync(path.join(temporada, "Serie.S01E01.pt-BR.srt"), "1");
  fs.writeFileSync(path.join(temporada, "Serie.S01E02.pt-BR.srt"), "1");
  fs.writeFileSync(path.join(temporada, "Serie.S01E02.en.srt"), "1");
  fs.writeFileSync(path.join(temporada, "Outro.nome.srt"), "1");

  const porArquivo = new Map(scanCatalog(root).map((item) => [item.fileName, item.subtitles.map((s) => path.basename(s.path))]));

  assert.deepEqual(porArquivo.get("Serie.S01E01.mkv"), ["Serie.S01E01.pt-BR.srt"]);
  assert.deepEqual(porArquivo.get("Serie.S01E02.mkv"), ["Serie.S01E02.pt-BR.srt", "Serie.S01E02.en.srt"]);
  assert.deepEqual(porArquivo.get("Serie.S01E10.mkv"), [], "E10 não pega a legenda do E01 nem a sem dono");
});

test("PQA-265: filme sozinho na pasta aceita legenda com outro nome, e o rótulo vem do nome", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pugoticine-"));
  const filme = path.join(root, "Filme (2020)");
  fs.mkdirSync(filme);
  fs.writeFileSync(path.join(filme, "Filme.2020.1080p.mkv"), "video");
  fs.writeFileSync(path.join(filme, "legenda.pt-BR.srt"), "1");
  fs.writeFileSync(path.join(filme, "Filme.2020.1080p.Forçada.pt-BR.srt"), "1");
  fs.writeFileSync(path.join(filme, "Filme.2020.1080p.pt-BR.srt"), "1");

  const rotulos = scanCatalog(root)[0]!.subtitles.map((s) => s.label).sort();

  assert.deepEqual(rotulos, ["Forçada", "Português (Brasil)", "Português (Brasil)"]);
});
