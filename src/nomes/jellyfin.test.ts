// PQA-218: as regras de nomes portadas do Jellyfin 10.11.10 dão exatamente o mesmo resultado que o binário original
// (oráculo em ferramentas/oraculo-nomes) para os arquivos reais do Zima e para os casos dos testes do próprio Jellyfin.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ehArquivoDeVideo, nomeDaSerie, pastaDe, resolverEpisodio, resolverVideo, temporadaDaPasta } from "./jellyfin.js";

const raizProjeto = new URL("../../", import.meta.url);
const entradas = fs.readFileSync(new URL("test/fixtures/oraculo-entrada.tsv", raizProjeto), "utf8").trim().split("\n").map(l => l.split("\t"));
const esperado = fs.readFileSync(new URL("test/fixtures/oraculo-jellyfin-10.11.10.jsonl", raizProjeto), "utf8").trim().split("\n").map(l => JSON.parse(l));

/** Mesmas chamadas do Program.cs do oráculo. */
function calcular(tipo: string, raizBruta: string, caminho: string) {
  const raiz = raizBruta.length > 1 ? raizBruta.replace(/\/+$/, "") : raizBruta;
  const relativo = caminho.slice(raiz === "/" ? 1 : raiz.length + 1);
  const primeiraPasta = relativo.includes("/") ? `${raiz === "/" ? "" : raiz}/${relativo.split("/")[0]}` : null;
  if (tipo === "tv") {
    const ep = resolverEpisodio(caminho, false);
    const pasta = pastaDe(caminho);
    const temporadaPasta = primeiraPasta !== null && pasta !== primeiraPasta ? temporadaDaPasta(pasta, primeiraPasta, true, true) : null;
    return {
      tipo, caminho: relativo, video: ehArquivoDeVideo(caminho),
      serie: primeiraPasta === null ? null : nomeDaSerie(primeiraPasta),
      temporada: ep?.temporada ?? temporadaPasta, temporadaArquivo: ep?.temporada ?? null, temporadaPasta,
      episodio: ep?.episodio ?? null, episodioFinal: ep?.episodioFinal ?? null, porData: ep?.porData ?? false,
      ano: ep?.ano ?? null, mes: ep?.mes ?? null, dia: ep?.dia ?? null
    };
  }
  const arquivo = resolverVideo(caminho, false, true, raiz);
  const pastaFilme = primeiraPasta === null ? null : resolverVideo(primeiraPasta, true, true, raiz);
  return {
    tipo, caminho: relativo, video: ehArquivoDeVideo(caminho),
    nomeArquivo: arquivo?.nome ?? null, anoArquivo: arquivo?.ano ?? null, extra: arquivo?.extra ?? null,
    nomePasta: pastaFilme?.nome ?? null, anoPasta: pastaFilme?.ano ?? null
  };
}

test("PQA-218: 277 casos idênticos ao Jellyfin 10.11.10 (arquivos do Zima + testes do Jellyfin)", () => {
  assert.equal(entradas.length, esperado.length);
  const diferentes: string[] = [];
  entradas.forEach(([tipo, raiz, caminho], i) => {
    const obtido = calcular(tipo, raiz, caminho);
    // O .NET grava "extra" como nome do enum ou null.
    try { assert.deepEqual(obtido, esperado[i]); }
    catch { diferentes.push(`${caminho}\n   esperado ${JSON.stringify(esperado[i])}\n   obtido   ${JSON.stringify(obtido)}`); }
  });
  assert.equal(diferentes.length, 0, `${diferentes.length} diferenças:\n${diferentes.slice(0, 12).join("\n")}`);
});
