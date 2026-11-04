// PQA-274: rota interna "Assistindo no Pugoticine" para o resumo do Pugoti Profile.
// Contra o Pugoticine em Docker (compose de desenvolvimento, PUGOTILAB_RESUMO_TOKEN=resumo-dev): marcos começa um
// filme (progresso no meio) e termina outro; a rota com o token devolve só o começado, com título, "faltam N min",
// pôster absoluto e porcentagem; sem token ou com token errado, 401.
import assert from "node:assert/strict";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const marcos = { cookie: "pugotilab_session=dev-marcos", "content-type": "application/json" };
const boot = await (await fetch(`${BASE}/api/bootstrap`, { headers: marcos })).json();
const filmes = boot.media.filter((m) => !m.serie);
assert.ok(filmes.length >= 2, "dois filmes de teste");
const [meio, fim] = filmes;
const salvar = (m, position, duration) => fetch(`${BASE}/api/progress`, { method: "POST", headers: marcos, body: JSON.stringify({ mediaId: m.id, position, duration }) });
assert.equal((await salvar(meio, 1200, 6000)).status, 200);
assert.equal((await salvar(fim, 5990, 6000)).status, 200);

const resumo = (token) => fetch(`${BASE}/api/pugotilab/assistindo/marcos`, { headers: token ? { "x-pugotilab-resumo": token } : {} });
assert.equal((await resumo()).status, 401);
assert.equal((await resumo("errado")).status, 401);
const r = await resumo("resumo-dev");
assert.equal(r.status, 200);
const { watching } = await r.json();
const item = watching.find((w) => w.title === meio.title);
assert.ok(item, JSON.stringify(watching));
assert.equal(item.detail, "faltam 80 min");
assert.equal(item.percent, 20);
assert.match(item.imageUrl, /^https:\/\/room\.pugotilab\.com\/api\/media\/[a-f0-9]{24}\/imagem\/poster\?v=.+&l=342$/);
assert.ok(!watching.some((w) => w.title === fim.title), "terminado não aparece");
console.log("PQA-274 (Pugoticine) ok");
