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
