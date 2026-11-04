// PQA-235: Bibliotecas de verdade (como o LibraryStructureController do Jellyfin) e acesso por usuário: a biblioteca
// padrão mantém os IDs do catálogo antigo; criar/editar/remover/rastrear com validação de pastas; séries nomeadas
// pelas regras do Jellyfin; biblioteca desativada sai do catálogo; acesso por biblioteca e classificação etária.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { Catalog } from "../catalog.js";
import { GerenciadorBibliotecas, idadeDaClassificacao, usuarioPodeVer } from "./bibliotecas.js";

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "bibliotecas-"));
const arquivo = (rel: string) => { const f = path.join(raiz, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, "x"); };
arquivo("Filmes/Matrix (1999)/Matrix (1999).mkv");
arquivo("Filmes/Coyote vs. Acme (2026)/Coyote.vs.Acme.2026.1080p.mkv");
arquivo("Animes/Daemons of the Shadow Realm/Season 1/Daemons.of.the.Shadow.Realm.S01E04.Jin.and.Yuru.1080p.mkv");
arquivo("Animes/Daemons of the Shadow Realm/Season 1/[Erai-raws] Yomi no Tsugai - 01 [1080p].mkv");
arquivo("Outros/clipe.mp4");
test.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
const novo = () => new GerenciadorBibliotecas(new Database(":memory:"), path.join(raiz, "Filmes"), [raiz]);

test("PQA-235: biblioteca padrão com os IDs do catálogo antigo", () => {
  const g = novo();
  const [padrao] = g.bibliotecas();
  assert.deepEqual([padrao.id, padrao.nome, padrao.tipo, padrao.pastas], ["filmes", "Filmes", "movies", [path.join(raiz, "Filmes")]]);
  const antigos = new Catalog(path.join(raiz, "Filmes")).scan().map(i => i.id).sort();
  assert.deepEqual(g.scan().map(i => i.id).sort(), antigos, "progresso e salas continuam valendo");
  assert.ok(g.list().every(i => i.bibliotecaId === "filmes" && i.bibliotecaNome === "Filmes"));
});

test("PQA-235: criar biblioteca de séries nomeia episódios pelas regras do Jellyfin; editar, desativar, remover", () => {
  const g = novo(); g.scan();
  const animes = g.criar({ nome: "Animes", tipo: "tvshows", pastas: [path.join(raiz, "Animes")] });
  const titulos = g.list().filter(i => i.bibliotecaId === animes.id).map(i => i.title).sort();
  assert.deepEqual(titulos, ["Daemons of the Shadow Realm · T1E01", "Daemons of the Shadow Realm · T1E04"]);
  assert.ok(g.list().filter(i => i.bibliotecaId === animes.id).every(i => /^[0-9a-f]{24}$/.test(i.id)), "IDs no formato das rotas");
  assert.equal(new Set(g.list().map(i => i.id)).size, g.list().length, "sem IDs repetidos");
  g.atualizar(animes.id, { nome: "Animes do Sábado" });
  assert.equal(g.list().find(i => i.bibliotecaId === animes.id)?.bibliotecaNome, "Animes do Sábado");
  g.atualizar(animes.id, { ativa: false });
  assert.equal(g.list().filter(i => i.bibliotecaId === animes.id).length, 0, "desativada sai do catálogo");
  g.atualizar(animes.id, { ativa: true, pastas: [path.join(raiz, "Animes"), path.join(raiz, "Outros")] });
  assert.equal(g.list().filter(i => i.bibliotecaId === animes.id).length, 3, "duas pastas na mesma biblioteca");
  g.remover(animes.id);
  assert.deepEqual(g.bibliotecas().map(b => b.nome), ["Filmes"]);
  assert.equal(g.list().length, 2);
});

test("PQA-235: validação das pastas e do nome", () => {
  const g = novo();
  assert.throws(() => g.criar({ nome: "Fora", tipo: "movies", pastas: ["/etc"] }), /fora das pastas de mídia permitidas/);
  assert.throws(() => g.criar({ nome: "Sumida", tipo: "movies", pastas: [path.join(raiz, "nao-existe")] }), /não existe/);
  assert.throws(() => g.criar({ nome: "Arquivo", tipo: "movies", pastas: [path.join(raiz, "Outros/clipe.mp4")] }), /não é uma pasta/);
  assert.throws(() => g.criar({ nome: "filmes", tipo: "movies", pastas: [path.join(raiz, "Outros")] }), /Já existe uma biblioteca/);
  assert.throws(() => g.criar({ nome: "Repetida", tipo: "movies", pastas: [path.join(raiz, "Filmes")] }), /já está na biblioteca Filmes/);
  assert.throws(() => g.criar({ nome: "Sem pasta", tipo: "movies", pastas: [] }), /ao menos uma pasta/);
  assert.throws(() => g.criar({ nome: "Tipo", tipo: "jogos" as never, pastas: [path.join(raiz, "Outros")] }), /Tipo de conteúdo inválido/);
  assert.throws(() => g.criar({ nome: "Escapando", tipo: "movies", pastas: [path.join(raiz, "Outros/../../")] }), /fora das pastas/);
});

test("PQA-235: acesso por biblioteca e classificação etária (UserPolicy)", () => {
  const livre = { todasBibliotecas: true, bibliotecas: [], classificacaoMaxima: null, bloquearSemClassificacao: false };
  const filme = (bibliotecaId: string, certification?: string) => ({ bibliotecaId, metadata: certification === undefined ? undefined : { certification } });
  assert.equal(usuarioPodeVer(livre, filme("animes", "R")), true);
  assert.equal(usuarioPodeVer({ ...livre, todasBibliotecas: false, bibliotecas: ["filmes"] }, filme("animes")), false);
  assert.equal(usuarioPodeVer({ ...livre, todasBibliotecas: false, bibliotecas: ["filmes"] }, filme("filmes")), true);
  assert.equal(usuarioPodeVer({ ...livre, classificacaoMaxima: 12 }, filme("filmes", "PG-13")), false);
  assert.equal(usuarioPodeVer({ ...livre, classificacaoMaxima: 14 }, filme("filmes", "PG-13")), true);
  assert.equal(usuarioPodeVer({ ...livre, classificacaoMaxima: 12 }, filme("filmes", "12")), true);
  assert.equal(usuarioPodeVer({ ...livre, bloquearSemClassificacao: true }, filme("filmes")), false);
  assert.equal(usuarioPodeVer({ ...livre, classificacaoMaxima: 10 }, filme("filmes")), true, "sem classificação só bloqueia se marcado");
  assert.deepEqual(["G", "PG", "PG-13", "R", "NC-17", "TV-MA", "L", "BR-14", "NR", ""].map(idadeDaClassificacao), [0, 10, 13, 17, 18, 17, 0, 14, null, null]);
});
