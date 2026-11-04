// PQA-237: tarefas agendadas como o TaskManager do Jellyfin: gatilhos diário, semanal, intervalo e na inicialização
// (próxima execução certa), validação, execução registrada (hora, duração, resultado), falha registrada e verificação
// periódica disparando só o que venceu.
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { Agendador, descreverGatilho, proximaDoGatilho, validarGatilhos } from "./tarefas.js";

const local = (s: string) => new Date(s); // horário local
test("PQA-237: próxima execução de cada gatilho", () => {
  const agora = local("2026-11-04T10:00:00"), inicio = local("2026-11-04T09:00:00");
  assert.equal(proximaDoGatilho({ tipo: "intervalo", intervaloMs: 12 * 3_600_000 }, null, inicio, agora)!.getTime(), local("2026-11-04T21:00:00").getTime(), "intervalo conta da inicialização");
  assert.equal(proximaDoGatilho({ tipo: "intervalo", intervaloMs: 3_600_000 }, local("2026-11-04T09:30:00"), inicio, agora)!.getTime(), local("2026-11-04T10:30:00").getTime(), "ou da última execução");
  assert.equal(proximaDoGatilho({ tipo: "diario", hora: "03:00" }, null, inicio, agora)!.getTime(), local("2026-11-05T03:00:00").getTime(), "diário já passou hoje → amanhã");
  assert.equal(proximaDoGatilho({ tipo: "diario", hora: "23:30" }, null, inicio, agora)!.getTime(), local("2026-11-04T23:30:00").getTime());
  const quarta = agora.getDay();
  assert.equal(proximaDoGatilho({ tipo: "semanal", dia: quarta, hora: "09:00" }, null, inicio, agora)!.getTime(), local("2026-11-11T09:00:00").getTime(), "mesmo dia, hora passou → semana que vem");
  assert.equal(proximaDoGatilho({ tipo: "semanal", dia: (quarta + 1) % 7, hora: "08:00" }, null, inicio, agora)!.getTime(), local("2026-11-05T08:00:00").getTime());
  assert.equal(proximaDoGatilho({ tipo: "inicializacao" }, null, inicio, agora), null);
  assert.deepEqual([{ tipo: "diario", hora: "03:00" }, { tipo: "semanal", dia: 6, hora: "04:30" }, { tipo: "intervalo", intervaloMs: 43_200_000 }, { tipo: "intervalo", intervaloMs: 900_000 }, { tipo: "inicializacao" }].map(g => descreverGatilho(g as never)),
    ["Diariamente à 03:00", "Sábado às 04:30", "A cada 12 horas", "A cada 15 minutos", "Na inicialização do aplicativo"]);
});

test("PQA-237: validação dos gatilhos", () => {
  assert.throws(() => validarGatilhos([{ tipo: "diario", hora: "25:00" }]), /Hora inválida/);
  assert.throws(() => validarGatilhos([{ tipo: "semanal", dia: 9, hora: "03:00" }]), /Dia da semana/);
  assert.throws(() => validarGatilhos([{ tipo: "intervalo", intervaloMs: 1234 }]), /Intervalo inválido/);
  assert.throws(() => validarGatilhos([{ tipo: "cron" }]), /Tipo de gatilho/);
  assert.deepEqual(validarGatilhos([{ tipo: "diario", hora: "03:00", extra: 1 }]), [{ tipo: "diario", hora: "03:00" }]);
});

test("PQA-237: executar registra hora, duração e resultado; falha também; verificar só dispara o que venceu", async () => {
  const db = new Database(":memory:");
  const terminadas: string[] = [];
  const a = new Agendador(db, (t, ok, msg) => terminadas.push(`${t.id}:${ok}:${msg}`));
  let rodou = 0;
  a.registrar({ id: "ok", nome: "Ok", descricao: "", categoria: "Manutenção", gatilhosPadrao: [{ tipo: "intervalo", intervaloMs: 900_000 }], executar: async () => { rodou++; return "feito"; } });
  a.registrar({ id: "falha", nome: "Falha", descricao: "", categoria: "Manutenção", gatilhosPadrao: [], executar: async () => { throw new Error("disco cheio"); } });
  const e1 = await a.executar("ok");
  assert.deepEqual([e1.resultado, e1.mensagem, rodou], ["Completed", "feito", 1]);
  assert.ok(e1.ultimaExecucao && e1.duracaoMs !== null);
  const e2 = await a.executar("falha");
  assert.deepEqual([e2.resultado, e2.mensagem], ["Failed", "disco cheio"]);
  assert.deepEqual(terminadas, ["ok:true:feito", "falha:false:disco cheio"]);
  assert.deepEqual(a.verificar(new Date()), [], "nada venceu");
  assert.deepEqual(a.verificar(new Date(Date.now() + 16 * 60_000)), ["ok"], "venceu o intervalo");
  a.definirGatilhos("falha", [{ tipo: "diario", hora: "03:00" }]);
  const outro = new Agendador(db); outro.registrar({ id: "falha", nome: "Falha", descricao: "", categoria: "Manutenção", gatilhosPadrao: [], executar: async () => {} });
  assert.deepEqual(outro.gatilhos("falha"), [{ tipo: "diario", hora: "03:00" }], "gatilhos persistem");
  assert.throws(() => a.definirGatilhos("nao-existe", []), /Tarefa não encontrada/);
});
