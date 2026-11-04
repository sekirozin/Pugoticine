// PQA-281: rotas do Pugoticine (public/rotas.js) — cada tela tem endereço próprio, ida e volta sem perder nada,
// endereços antigos (?play=, ?sala=) convertidos e endereços inexistentes levam ao Início.
// Rodar: node --test test/rotas.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { lerRota, enderecoDe, viewDe, rotaDaView } from "../public/rotas.js";

test("PQA-281: cada tela lê e monta o mesmo endereço", () => {
  const casos = [
    ["/", { tela: "inicio" }],
    ["/biblioteca/filmes", { tela: "biblioteca", biblioteca: "filmes" }],
    ["/biblioteca/filmes?genero=Com%C3%A9dia&ordem=ano", { tela: "biblioteca", biblioteca: "filmes", genero: "Comédia", ordem: "ano" }],
    ["/continuar", { tela: "continuar" }],
    ["/busca?q=matrix+1999", { tela: "busca", q: "matrix 1999" }],
    ["/titulo/abc123", { tela: "titulo", id: "abc123" }],
    ["/titulo/serie-x?temporada=2", { tela: "titulo", id: "serie-x", temporada: 2 }],
    ["/titulo/serie-x?temporada=0", { tela: "titulo", id: "serie-x", temporada: 0 }],
    ["/assistir/abc123", { tela: "assistir", id: "abc123" }],
    ["/painel", { tela: "painel", pagina: "painel" }],
    ["/painel/reproducao-transcodificacao", { tela: "painel", pagina: "reproducao-transcodificacao" }],
    ["/salas", { tela: "salas" }],
    ["/salas/s1?convite=XYZ", { tela: "salas", sala: "s1", convite: "XYZ" }]
  ];
  for (const [endereco, rota] of casos) {
    assert.deepEqual(lerRota(endereco), rota, endereco);
    assert.deepEqual(lerRota(enderecoDe(rota)), rota, `ida e volta: ${endereco}`);
  }
  assert.equal(enderecoDe({ tela: "busca", q: "matrix 1999" }), "/busca?q=matrix+1999");
  assert.equal(enderecoDe({ tela: "painel", pagina: "painel" }), "/painel");
  assert.equal(enderecoDe({ tela: "biblioteca", biblioteca: "filmes", ordem: "titulo", genero: "" }), "/biblioteca/filmes", "ordem padrão e filtro vazio ficam fora");
  assert.equal(enderecoDe({ tela: "titulo", id: "a b/c" }), "/titulo/a%20b%2Fc");
  assert.deepEqual(lerRota("/titulo/a%20b%2Fc"), { tela: "titulo", id: "a b/c" });
});

test("PQA-281: endereços antigos e inexistentes", () => {
  assert.deepEqual(lerRota("/?play=abc"), { tela: "assistir", id: "abc", antiga: true });
  assert.deepEqual(lerRota("/?sala=s1&convite=K"), { tela: "salas", sala: "s1", convite: "K", antiga: true });
  assert.deepEqual(lerRota("/?sala=s1"), { tela: "salas", sala: "s1", antiga: true });
  for (const ruim of ["/nada", "/titulo", "/assistir", "/biblioteca", "/titulo/a/b", "/continuar/x", "/titulo/%E0%A4%A"]) {
    assert.deepEqual(lerRota(ruim), { tela: "inicio", desconhecida: true }, ruim);
  }
  assert.equal(lerRota("/biblioteca/f?ordem=qualquer").ordem, undefined, "ordem inválida é ignorada");
  assert.equal(lerRota("/titulo/x?temporada=-1").temporada, undefined);
  assert.equal(lerRota("/titulo/x?temporada=abc").temporada, undefined);
});

test("PQA-281: view do menu lateral ↔ rota", () => {
  for (const view of ["home", "continue", "painel", "biblioteca:animes"]) assert.equal(viewDe(rotaDaView(view)), view);
  assert.equal(viewDe({ tela: "busca", q: "x" }), "home");
});
