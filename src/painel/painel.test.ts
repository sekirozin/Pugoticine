// PQA-230: Painel do administrador (equivalente à página inicial do Painel do Jellyfin): contagens, "assistindo agora"
// pelo progresso recente (< 60 s, não concluído), atividade com título, bibliotecas e tarefas com próxima varredura.
import assert from "node:assert/strict";
import test from "node:test";
import { montarPainel, type InfoServidor } from "./painel.js";
import type { MediaItem } from "../types.js";

const filme = (id: string, title: string, size: number, legendas = 0) => ({ id, title, year: 2020, size, subtitles: Array(legendas).fill({}) }) as unknown as MediaItem;
const agora = new Date("2026-11-03T15:00:00Z");
const ha = (s: number) => new Date(agora.getTime() - s * 1000).toISOString();
const servidor = { nome: "PugotiCine" } as InfoServidor;

test("PQA-230: contagens, assistindo agora, atividade e próxima varredura", () => {
  const p = montarPainel({
    catalogo: [filme("a", "Coyote", 100, 1), filme("b", "Godfather", 300, 2)],
    ultimaVarredura: "2026-11-03T14:50:00.000Z", intervaloVarreduraMs: 15 * 60_000, raizMidia: "/media/movies",
    atividade: [
      { usuario: "marcos", mediaId: "a", posicao: 600, duracao: 1200, concluido: false, atualizadoEm: ha(10) },
      { usuario: "mael", mediaId: "b", posicao: 1150, duracao: 1200, concluido: true, atualizadoEm: ha(20) },
      { usuario: "ivis", mediaId: "b", posicao: 100, duracao: 1200, concluido: false, atualizadoEm: ha(600) },
      { usuario: "ivis", mediaId: "x", posicao: 5, duracao: 10, concluido: false, atualizadoEm: ha(5) }
    ],
    agora, servidor, discos: []
  });
  assert.deepEqual(p.contagens, { filmes: 2, tamanhoBytes: 400, legendas: 3, usuariosComAtividade: 3 });
  assert.deepEqual(p.assistindo.map(a => [a.usuario, a.titulo, a.percentual]), [["marcos", "Coyote", 50], ["ivis", "Título removido", 50]], "só progresso recente e não concluído");
  assert.equal(p.atividade.length, 4);
  assert.equal(p.atividade[1].titulo, "Godfather");
  assert.equal(p.bibliotecas[0].itens, 2);
  assert.equal(p.bibliotecas[0].proximaVarredura, "2026-11-03T15:05:00.000Z");
  assert.equal(p.tarefas[0].intervaloMinutos, 15);
});

test("PQA-230: sem varredura ainda, sem próxima execução", () => {
  const p = montarPainel({ catalogo: [], ultimaVarredura: "", intervaloVarreduraMs: 60_000, raizMidia: "/m", atividade: [], agora, servidor, discos: [] });
  assert.equal(p.bibliotecas[0].proximaVarredura, null);
  assert.deepEqual(p.assistindo, []);
});
