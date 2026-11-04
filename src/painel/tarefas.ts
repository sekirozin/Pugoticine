// Tarefas agendadas (Painel › Avançado › Tarefas Agendadas), como o TaskManager/ScheduledTaskWorker do Jellyfin
// 10.11.10: cada tarefa tem gatilhos (TaskTriggerInfo: diário, semanal, intervalo, na inicialização), estado da
// última execução (hora, duração, resultado) e pode ser iniciada à mão. Gatilhos e estado ficam em painel.db.
import type Database from "better-sqlite3";

export type Gatilho =
  | { tipo: "intervalo"; intervaloMs: number }
  | { tipo: "diario"; hora: string }
  | { tipo: "semanal"; dia: number; hora: string }
  | { tipo: "inicializacao" };
export interface DefinicaoTarefa {
  id: string; nome: string; descricao: string; categoria: "Biblioteca" | "Manutenção" | "Aplicação";
  gatilhosPadrao: Gatilho[]; executar: () => Promise<string | void>;
}
export interface EstadoTarefa {
  id: string; nome: string; descricao: string; categoria: string; gatilhos: Gatilho[]; executando: boolean;
  ultimaExecucao: string | null; duracaoMs: number | null; resultado: "Completed" | "Failed" | null; mensagem: string | null; proximaExecucao: string | null;
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const INTERVALOS_MS = [15, 30, 45, 60, 120, 180, 240, 360, 480, 720, 1440].map(m => m * 60_000);
export const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export function validarGatilhos(entrada: unknown): Gatilho[] {
  if (!Array.isArray(entrada) || entrada.length > 20) throw new Error("Lista de gatilhos inválida.");
  return entrada.map((g: Record<string, unknown>) => {
    if (g?.tipo === "inicializacao") return { tipo: "inicializacao" };
    if (g?.tipo === "intervalo") {
      const ms = Number(g.intervaloMs);
      if (!INTERVALOS_MS.includes(ms)) throw new Error("Intervalo inválido.");
      return { tipo: "intervalo", intervaloMs: ms };
    }
    if (g?.tipo === "diario" || g?.tipo === "semanal") {
      if (typeof g.hora !== "string" || !HORA.test(g.hora)) throw new Error("Hora inválida (use HH:MM).");
      if (g.tipo === "diario") return { tipo: "diario", hora: g.hora };
      const dia = Number(g.dia);
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) throw new Error("Dia da semana inválido.");
      return { tipo: "semanal", dia, hora: g.hora };
    }
    throw new Error("Tipo de gatilho inválido.");
  });
}

/** Texto do gatilho como o Jellyfin mostra ("Diariamente à 03:00", "A cada 12 horas"...). */
export function descreverGatilho(g: Gatilho): string {
  if (g.tipo === "inicializacao") return "Na inicialização do aplicativo";
  if (g.tipo === "diario") return `Diariamente à ${g.hora}`;
  if (g.tipo === "semanal") return `${DIAS[g.dia]} às ${g.hora}`;
  const min = g.intervaloMs / 60_000;
  return min >= 60 ? `A cada ${min / 60} horas` : `A cada ${min} minutos`;
}

/** Próxima execução de um gatilho (null para "na inicialização", que roda uma vez ao ligar). */
export function proximaDoGatilho(g: Gatilho, ultima: Date | null, iniciadoEm: Date, agora: Date): Date | null {
  if (g.tipo === "inicializacao") return null;
  if (g.tipo === "intervalo") return new Date((ultima ?? iniciadoEm).getTime() + g.intervaloMs);
  const [h, m] = g.hora.split(":").map(Number);
  const base = new Date(agora);
  base.setHours(h, m, 0, 0);
  if (g.tipo === "diario") {
    if (base <= agora || (ultima && ultima >= base)) base.setDate(base.getDate() + 1);
    return base;
  }
  let dias = (g.dia - base.getDay() + 7) % 7;
  if (dias === 0 && (base <= agora || (ultima && ultima >= base))) dias = 7;
  base.setDate(base.getDate() + dias);
  return base;
}

export class Agendador {
  private readonly definicoes = new Map<string, DefinicaoTarefa>();
  private readonly executando = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private readonly iniciadoEm = new Date();
  constructor(private readonly db: Database.Database, private readonly aoTerminar: (t: DefinicaoTarefa, ok: boolean, mensagem: string | null) => void = () => {}) {
    db.exec("CREATE TABLE IF NOT EXISTS tarefas (id TEXT PRIMARY KEY, gatilhos TEXT, ultimaExecucao TEXT, duracaoMs INTEGER, resultado TEXT, mensagem TEXT)");
  }
  registrar(d: DefinicaoTarefa): void { this.definicoes.set(d.id, d); }

  private linha(id: string) { return this.db.prepare("SELECT * FROM tarefas WHERE id = ?").get(id) as Record<string, unknown> | undefined; }
  gatilhos(id: string): Gatilho[] {
    const r = this.linha(id);
    return r?.gatilhos ? JSON.parse(String(r.gatilhos)) : this.definicoes.get(id)?.gatilhosPadrao ?? [];
  }
  definirGatilhos(id: string, entrada: unknown): Gatilho[] {
    if (!this.definicoes.has(id)) throw new Error("Tarefa não encontrada.");
    const gatilhos = validarGatilhos(entrada);
    this.db.prepare("INSERT INTO tarefas (id, gatilhos) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET gatilhos = excluded.gatilhos").run(id, JSON.stringify(gatilhos));
    return gatilhos;
  }
  estado(id: string, agora = new Date()): EstadoTarefa {
    const d = this.definicoes.get(id);
    if (!d) throw new Error("Tarefa não encontrada.");
    const r = this.linha(id);
    const ultima = r?.ultimaExecucao ? new Date(String(r.ultimaExecucao)) : null;
    const gatilhos = this.gatilhos(id);
    const proximas = gatilhos.map(g => proximaDoGatilho(g, ultima, this.iniciadoEm, agora)).filter((x): x is Date => x !== null);
    return { id, nome: d.nome, descricao: d.descricao, categoria: d.categoria, gatilhos, executando: this.executando.has(id),
      ultimaExecucao: ultima?.toISOString() ?? null, duracaoMs: r?.duracaoMs === null || r?.duracaoMs === undefined ? null : Number(r.duracaoMs),
      resultado: (r?.resultado as EstadoTarefa["resultado"]) ?? null, mensagem: (r?.mensagem as string) ?? null,
      proximaExecucao: proximas.length ? new Date(Math.min(...proximas.map(p => p.getTime()))).toISOString() : null };
  }
  lista(): EstadoTarefa[] { return [...this.definicoes.keys()].map(id => this.estado(id)); }

  async executar(id: string): Promise<EstadoTarefa> {
    const d = this.definicoes.get(id);
    if (!d) throw new Error("Tarefa não encontrada.");
    if (this.executando.has(id)) return this.estado(id);
    this.executando.add(id);
    const inicio = Date.now();
    let ok = true, mensagem: string | null = null;
    try { mensagem = (await d.executar()) ?? null; }
    catch (erro) { ok = false; mensagem = erro instanceof Error ? erro.message : String(erro); }
    finally {
      this.executando.delete(id);
      this.db.prepare(`INSERT INTO tarefas (id, ultimaExecucao, duracaoMs, resultado, mensagem) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET ultimaExecucao = excluded.ultimaExecucao, duracaoMs = excluded.duracaoMs, resultado = excluded.resultado, mensagem = excluded.mensagem`)
        .run(id, new Date().toISOString(), Date.now() - inicio, ok ? "Completed" : "Failed", mensagem);
    }
    this.aoTerminar(d, ok, mensagem);
    return this.estado(id);
  }

  /** Verifica os gatilhos a cada 30 s e roda os de "na inicialização" uma vez. */
  iniciar(verificarCadaMs = 30_000): void {
    if (this.timer) return;
    setTimeout(() => {
      for (const id of this.definicoes.keys()) if (this.gatilhos(id).some(g => g.tipo === "inicializacao")) void this.executar(id);
    }, 5_000).unref();
    this.timer = setInterval(() => this.verificar(), verificarCadaMs);
    this.timer.unref();
  }
  verificar(agora = new Date()): string[] {
    const disparadas: string[] = [];
    for (const id of this.definicoes.keys()) {
      if (this.executando.has(id)) continue;
      const proxima = this.estado(id, agora).proximaExecucao;
      if (proxima && Date.parse(proxima) <= agora.getTime()) { disparadas.push(id); void this.executar(id); }
    }
    return disparadas;
  }
  parar(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
