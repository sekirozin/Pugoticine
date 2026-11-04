import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Store } from "./store.js";

test("PQA-282: marcar e desmarcar como assistido", () => {
  const store = new Store(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pugoticine-")), "db.sqlite"));
  store.saveProgress("ana", "a", 600, 6000);
  const marcados = store.marcarAssistido("ana", ["a", "b", "b"], true);
  assert.equal(marcados.length, 2, "ids repetidos contam uma vez");
  assert.ok(marcados.every((p) => p.completed && p.position === 0));
  assert.equal(marcados.find((p) => p.mediaId === "a")?.duration, 6000, "duração preservada");
  const lista = store.listProgress("ana");
  assert.deepEqual(lista.map((p) => [p.mediaId, p.completed]).sort(), [["a", true], ["b", true]]);
  assert.equal(store.listProgress("bia").length, 0, "outro usuário não é afetado");
  const desmarcados = store.marcarAssistido("ana", ["a"], false);
  assert.equal(desmarcados[0]?.completed, false);
  assert.equal(desmarcados[0]?.position, 0);
});
