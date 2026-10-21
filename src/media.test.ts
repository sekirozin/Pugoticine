import assert from "node:assert/strict";
import test from "node:test";
import { parseByteRange } from "./media.js";

test("interpreta intervalo parcial de vídeo", () => {
  assert.deepEqual(parseByteRange("bytes=100-199", 1000), { start: 100, end: 199 });
});

test("limita o final do intervalo ao tamanho do arquivo", () => {
  assert.deepEqual(parseByteRange("bytes=900-2000", 1000), { start: 900, end: 999 });
});
