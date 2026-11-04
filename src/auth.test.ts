import assert from "node:assert/strict";
import test from "node:test";
import { AuthIndisponivel, criarLeitorDePerfil } from "./auth.js";

test("PQA-268/277: perfil do Pugotilab em cache curto por sessão (uma consulta ao auth, não uma por requisição)", async () => {
  let consultas = 0;
  let relogio = 1_000;
  let valido = true;
  const lerPerfil = criarLeitorDePerfil({
    url: "http://auth/auth/api/profile", validadeMs: 30_000, maximo: 2, agora: () => relogio,
    buscar: async (_url, init) => {
      consultas++;
      const token = /pugotilab_session=([^;]+)/.exec(init.headers.Cookie)![1];
      return { ok: valido, json: async () => ({ profile: { username: token.toUpperCase(), role: token === "adm" ? "admin" : "user", avatarUrl: "https://pugotilab.com/auth/avatar/1?v=a" } }) };
    }
  });

  assert.equal((await lerPerfil("ana"))?.username, "ana");
  for (let i = 0; i < 20; i++) await lerPerfil("ana");
  assert.equal(consultas, 1, "20 requisições, uma consulta");

  relogio += 30_001;
  await lerPerfil("ana");
  assert.equal(consultas, 2, "depois de 30 s consulta de novo (sessão encerrada no auth deixa de valer)");

  valido = false;
  assert.equal(await lerPerfil("bia"), null, "sessão recusada não entra no cache");
  valido = true;
  assert.equal((await lerPerfil("bia"))?.username, "bia");
  assert.equal((await lerPerfil("adm"))?.role, "admin");
  const antes = consultas;
  await lerPerfil("ana");
  assert.equal(consultas, antes + 1, "limite de entradas: a mais antiga saiu do cache");
});

test("PQA-277: padrão de 3 s — sessão encerrada no auth deixa de valer quase na hora", async () => {
  let relogio = 0;
  let ativa = true;
  const lerPerfil = criarLeitorDePerfil({
    url: "http://auth/auth/api/session", agora: () => relogio,
    buscar: async () => ({ ok: ativa, json: async () => ({ profile: { username: "ana" } }) })
  });
  assert.equal((await lerPerfil("t"))?.username, "ana");
  ativa = false;
  relogio += 2_000;
  assert.equal((await lerPerfil("t"))?.username, "ana", "dentro dos 3 s ainda vale (rajada de trechos)");
  relogio += 1_001;
  assert.equal(await lerPerfil("t"), null, "depois de 3 s o Sair já vale");
});

test("PQA-284: auth fora do ar ou lento não desloga quem está assistindo; só a recusa do auth encerra a sessão", async () => {
  let relogio = 0;
  let modo: "ok" | "cai" | "erro500" | "recusa" = "ok";
  const lerPerfil = criarLeitorDePerfil({
    url: "http://auth/auth/api/session", agora: () => relogio,
    buscar: async () => {
      if (modo === "cai") throw new Error("timeout");
      if (modo === "erro500") return { ok: false, status: 502, json: async () => ({}) };
      if (modo === "recusa") return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ profile: { username: "ana" } }) };
    }
  });
  assert.equal((await lerPerfil("t"))?.username, "ana");
  relogio += 60_000; modo = "cai";
  assert.equal((await lerPerfil("t"))?.username, "ana", "auth sem responder: vale a última sessão válida");
  relogio += 60_000; modo = "erro500";
  assert.equal((await lerPerfil("t"))?.username, "ana", "auth com 5xx: idem");
  relogio += 31 * 60_000;
  await assert.rejects(lerPerfil("t"), AuthIndisponivel, "mais de 30 min sem confirmar: indisponível (503), não deslogado");
  await assert.rejects(lerPerfil("nova"), AuthIndisponivel, "sessão nunca vista com o auth fora: 503");
  modo = "ok";
  assert.equal((await lerPerfil("t"))?.username, "ana");
  relogio += 4_000; modo = "recusa";
  assert.equal(await lerPerfil("t"), null, "Sair/sessão encerrada no auth: vale na hora");
  modo = "cai";
  await assert.rejects(lerPerfil("t"), AuthIndisponivel, "depois da recusa, a sessão antiga não volta a valer");
});
