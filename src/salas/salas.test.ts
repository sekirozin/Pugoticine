// PQA-250: salas de filme — visibilidade (pública, com senha, privada), senha só em hash, convites e código de
// convite, permissão de controle, e estados de reprodução como o SyncPlay do Jellyfin (início agendado pelo maior ping,
// espera enquanto alguém carrega, limite de espera).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { ESPERA_MAXIMA_MS, GerenciadorSalas, PING_PADRAO_MS, type Usuario } from "./salas.js";

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "salas-"));
test.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
let relogio = 1_000_000;
const agora = () => relogio;
const sekiro: Usuario = { username: "sekiro", nome: "sekiro", role: "admin" };
const marcos: Usuario = { username: "marcos", nome: "marcos", role: "user" };
const mael: Usuario = { username: "mael", nome: "mael", role: "user" };

test("PQA-250: visibilidade e entrada por tipo de sala", () => {
  const g = new GerenciadorSalas(path.join(pasta, "a.db"), agora);
  const publica = g.criar(sekiro, { nome: "Sessão aberta", tipo: "publica" });
  const comSenha = g.criar(sekiro, { nome: "Com senha", tipo: "senha", senha: "pipoca123" });
  const privada = g.criar(sekiro, { nome: "Só nós", tipo: "privada", convidados: ["@Marcos", "x"] });
  assert.deepEqual(privada.convidados, ["marcos"], "username normalizado; inválido descartado");
  assert.deepEqual(g.listar(mael).map(s => s.nome).sort(), ["Com senha", "Sessão aberta"], "privada não aparece para quem não foi convidado");
  assert.ok(g.listar(marcos).some(s => s.id === privada.id), "convidado vê a privada");
  assert.throws(() => g.obter(privada.id, mael), /não encontrada/, "privada responde como inexistente");
  assert.throws(() => g.entrar(privada.id, mael, {}), /não encontrada/);
  g.entrar(privada.id, mael, { convite: privada.codigoConvite });
  assert.ok(g.listar(mael).some(s => s.id === privada.id), "o código de convite dá acesso");
  assert.throws(() => g.entrar(comSenha.id, marcos, { senha: "errada" }), /Senha incorreta/);
  assert.throws(() => g.comando(comSenha.id, marcos, { tipo: "pausar" }), /Entre na sala/);
  g.entrar(comSenha.id, marcos, { senha: "pipoca123" });
  assert.ok(g.temAcesso(comSenha, marcos));
  assert.ok(g.temAcesso(publica, mael));
  // Senha nunca gravada em claro.
  const banco = new Database(path.join(pasta, "a.db"), { readonly: true });
  const linha = banco.prepare("SELECT senhaHash FROM salas WHERE id = ?").get(comSenha.id) as { senhaHash: string };
  assert.match(linha.senhaHash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.ok(!fs.readFileSync(path.join(pasta, "a.db")).includes("pipoca123"));
  banco.close();
  // Só o dono vê o código e convida; convidado não recebe o código.
  assert.equal(g.publico(privada, marcos).codigoConvite, undefined);
  assert.ok(g.publico(privada, sekiro).codigoConvite);
  assert.throws(() => g.convidar(privada.id, marcos, ["ivis"]), /Só o dono/);
  g.convidar(privada.id, sekiro, ["ivis"]);
  assert.deepEqual(privada.convidados, ["marcos", "ivis"]);
  // Persistência: reabrir mantém as salas.
  g.fechar();
  const reaberto = new GerenciadorSalas(path.join(pasta, "a.db"), agora);
  assert.equal(reaberto.listar(sekiro).length, 3);
  reaberto.fechar();
});

test("PQA-250: reprodução como o SyncPlay — início agendado, espera por quem carrega, pulo, controle do dono", () => {
  const g = new GerenciadorSalas(path.join(pasta, "b.db"), agora);
  const s = g.criar(sekiro, { nome: "Filme", tipo: "publica", mediaId: "m1" });
  g.conectar(s, sekiro); g.conectar(s, marcos);
  g.comando(s.id, marcos, { tipo: "ping", ping: 120 });
  g.comando(s.id, sekiro, { tipo: "ping", ping: 40 }); // sem medir, o ping padrão (500) daria 1000 ms de atraso
  // Tocar: todos aguardam prontos; quando todos ficam prontos, o início é agendado (max(2 × 120, 500) = 500 ms).
  g.comando(s.id, sekiro, { tipo: "tocar", posicao: 10 });
  assert.equal(s.reproducao.estado, "aguardando");
  g.comando(s.id, sekiro, { tipo: "pronto" });
  assert.equal(s.reproducao.estado, "aguardando", "ainda espera o marcos");
  g.comando(s.id, marcos, { tipo: "pronto" });
  assert.equal(s.reproducao.estado, "tocando");
  assert.equal(s.reproducao.quando, relogio + PING_PADRAO_MS);
  relogio += PING_PADRAO_MS + 4000;
  assert.equal(g.posicaoAtual(s), 14, "posição = início + tempo desde o instante combinado");
  // Alguém trava carregando → todos esperam no ponto.
  g.comando(s.id, marcos, { tipo: "carregando" });
  assert.equal(s.reproducao.estado, "aguardando");
  assert.equal(s.reproducao.posicao, 14);
  // Quem não responde é ignorado depois do limite.
  relogio += ESPERA_MAXIMA_MS;
  g.verificarTodas();
  assert.equal(s.reproducao.estado, "tocando");
  // Pausar e pular.
  g.comando(s.id, marcos, { tipo: "pausar", posicao: 20 });
  assert.deepEqual([s.reproducao.estado, s.reproducao.posicao], ["pausado", 20]);
  g.comando(s.id, marcos, { tipo: "pular", posicao: 300 });
  assert.deepEqual([s.reproducao.estado, s.reproducao.posicao], ["pausado", 300], "pulo pausado só move");
  const versao = s.reproducao.versao;
  g.comando(s.id, sekiro, { tipo: "filme", mediaId: "m2" });
  assert.deepEqual([s.reproducao.mediaId, s.reproducao.posicao, s.reproducao.estado], ["m2", 0, "pausado"]);
  assert.ok(s.reproducao.versao > versao);
  // Sala em que só o dono controla.
  const s2 = g.criar(sekiro, { nome: "Do dono", tipo: "publica", controle: "dono", mediaId: "m1" });
  assert.throws(() => g.comando(s2.id, marcos, { tipo: "tocar" }), /só o dono/);
  g.comando(s2.id, marcos, { tipo: "carregando" }); // avisar carregamento continua permitido
  g.fechar();
});
