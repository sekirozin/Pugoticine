// Salas de filme com reprodução sincronizada, inspiradas no SyncPlay do Jellyfin 10.11.10 (ver docs/salas-sincronizadas.md).
//  - Tipos: pública (listada), com senha (listada, entra com senha; só o hash scrypt é guardado) e privada (não
//    listada; entra o dono, os convidados e quem tem o código de convite).
//  - Estado de reprodução como o grupo do SyncPlay: parado → pausado/tocando, e "aguardando" enquanto alguém carrega
//    (Waiting): ninguém avança até todos estarem prontos (ou o tempo de espera esgotar, como o IgnoreGroupWait).
//  - "Tocar" é agendado no futuro (max(2 × maior ping, 500 ms), como PlayingGroupState.HandleRequest(Unpause)) para
//    todos começarem no mesmo instante; a posição de quem toca é posição + (agora − quando).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type TipoSala = "publica" | "senha" | "privada";
export type Controle = "todos" | "dono";
export type EstadoReproducao = "parado" | "pausado" | "tocando" | "aguardando";

export interface Reproducao { mediaId: string | null; estado: EstadoReproducao; posicao: number; quando: number; versao: number }
export interface Membro { username: string; nome: string; conexoes: number; ping: number; carregando: boolean }
export interface Sala {
  id: string; nome: string; tipo: TipoSala; senhaHash: string | null; dono: string; convidados: string[];
  participantes: string[]; controle: Controle; codigoConvite: string; criadaEm: string;
  reproducao: Reproducao; membros: Map<string, Membro>; esperaAte: number | null;
}
export interface Usuario { username: string; nome: string; role: "admin" | "user" }

export const PING_PADRAO_MS = 500;          // Group.DefaultPing
export const ESPERA_MAXIMA_MS = 10_000;     // limite da espera por quem está carregando
const USERNAME = /^[a-z0-9._-]{2,40}$/;

export class ErroSala extends Error { constructor(readonly status: number, mensagem: string) { super(mensagem); } }

export function hashSenha(senha: string): string {
  const sal = crypto.randomBytes(16);
  return `scrypt$${sal.toString("hex")}$${crypto.scryptSync(senha, sal, 32).toString("hex")}`;
}
export function conferirSenha(senha: string, hash: string): boolean {
  const [tipo, sal, valor] = hash.split("$");
  if (tipo !== "scrypt" || !sal || !valor) return false;
  const calculado = crypto.scryptSync(senha, Buffer.from(sal, "hex"), 32);
  const esperado = Buffer.from(valor, "hex");
  return esperado.length === calculado.length && crypto.timingSafeEqual(calculado, esperado);
}

function normalizarUsuarios(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.map(u => String(u).trim().toLowerCase().replace(/^@/, "")).filter(u => USERNAME.test(u)))];
}

export class GerenciadorSalas {
  private readonly salas = new Map<string, Sala>();
  private readonly db: Database.Database;
  private readonly ouvintes = new Set<(sala: Sala) => void>();
  constructor(arquivo: string, private readonly agora: () => number = Date.now) {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    this.db = new Database(arquivo);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`CREATE TABLE IF NOT EXISTS salas (
      id TEXT PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL, senhaHash TEXT, dono TEXT NOT NULL,
      convidados TEXT NOT NULL DEFAULT '[]', participantes TEXT NOT NULL DEFAULT '[]', controle TEXT NOT NULL DEFAULT 'todos',
      codigoConvite TEXT NOT NULL, mediaId TEXT, criadaEm TEXT NOT NULL)`);
    for (const l of this.db.prepare("SELECT * FROM salas").all() as Array<Record<string, string | null>>) {
      this.salas.set(String(l.id), {
        id: String(l.id), nome: String(l.nome), tipo: l.tipo as TipoSala, senhaHash: l.senhaHash, dono: String(l.dono),
        convidados: JSON.parse(String(l.convidados)), participantes: JSON.parse(String(l.participantes)),
        controle: l.controle as Controle, codigoConvite: String(l.codigoConvite), criadaEm: String(l.criadaEm),
        reproducao: { mediaId: l.mediaId, estado: l.mediaId ? "pausado" : "parado", posicao: 0, quando: this.agora(), versao: 1 },
        membros: new Map(), esperaAte: null
      });
    }
  }

  /** Avisado a cada mudança de uma sala (o HTTP repassa para os membros conectados). */
  aoMudar(funcao: (sala: Sala) => void): () => void { this.ouvintes.add(funcao); return () => this.ouvintes.delete(funcao); }
  private avisar(sala: Sala): void { for (const f of this.ouvintes) f(sala); }
  private salvar(s: Sala): void {
    this.db.prepare(`INSERT INTO salas (id, nome, tipo, senhaHash, dono, convidados, participantes, controle, codigoConvite, mediaId, criadaEm)
      VALUES (@id, @nome, @tipo, @senhaHash, @dono, @convidados, @participantes, @controle, @codigoConvite, @mediaId, @criadaEm)
      ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, tipo=excluded.tipo, senhaHash=excluded.senhaHash, convidados=excluded.convidados,
      participantes=excluded.participantes, controle=excluded.controle, mediaId=excluded.mediaId`).run({
      id: s.id, nome: s.nome, tipo: s.tipo, senhaHash: s.senhaHash, dono: s.dono, convidados: JSON.stringify(s.convidados),
      participantes: JSON.stringify(s.participantes), controle: s.controle, codigoConvite: s.codigoConvite,
      mediaId: s.reproducao.mediaId, criadaEm: s.criadaEm });
  }

  criar(dono: Usuario, dados: { nome?: unknown; tipo?: unknown; senha?: unknown; convidados?: unknown; controle?: unknown; mediaId?: unknown }): Sala {
    const nome = String(dados.nome ?? "").trim().slice(0, 80);
    if (!nome) throw new ErroSala(400, "Dê um nome para a sala.");
    const tipo = dados.tipo as TipoSala;
    if (!["publica", "senha", "privada"].includes(tipo)) throw new ErroSala(400, "Tipo de sala inválido.");
    const senha = typeof dados.senha === "string" ? dados.senha : "";
    if (tipo === "senha" && senha.length < 4) throw new ErroSala(400, "A senha precisa ter pelo menos 4 caracteres.");
    const sala: Sala = {
      id: crypto.randomUUID(), nome, tipo, senhaHash: tipo === "senha" ? hashSenha(senha) : null, dono: dono.username,
      convidados: normalizarUsuarios(dados.convidados).filter(u => u !== dono.username), participantes: [],
      controle: dados.controle === "dono" ? "dono" : "todos", codigoConvite: crypto.randomBytes(12).toString("base64url"),
      criadaEm: new Date(this.agora()).toISOString(),
      reproducao: { mediaId: typeof dados.mediaId === "string" && dados.mediaId ? dados.mediaId : null, estado: "parado", posicao: 0, quando: this.agora(), versao: 1 },
      membros: new Map(), esperaAte: null
    };
    if (sala.reproducao.mediaId) sala.reproducao.estado = "pausado";
    this.salas.set(sala.id, sala);
    this.salvar(sala);
    return sala;
  }

  /** Quem já pode entrar sem senha nem código. */
  temAcesso(s: Sala, u: Usuario): boolean {
    return s.tipo === "publica" || s.dono === u.username || s.convidados.includes(u.username) || s.participantes.includes(u.username);
  }
  /** Aparece na lista: públicas e com senha para todos; privadas só para dono e convidados. */
  visivel(s: Sala, u: Usuario): boolean {
    return s.tipo !== "privada" || this.temAcesso(s, u);
  }
  listar(u: Usuario): Sala[] {
    return [...this.salas.values()].filter(s => this.visivel(s, u)).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
  }
  obter(id: string, u: Usuario): Sala {
    const s = this.salas.get(id);
    // Privada sem acesso responde como inexistente (não revela que existe).
    if (!s || !this.visivel(s, u)) throw new ErroSala(404, "Sala não encontrada.");
    return s;
  }
  /** Entrar: pública direto; com senha confere a senha; privada aceita o código de convite. */
  entrar(id: string, u: Usuario, credenciais: { senha?: unknown; convite?: unknown }): Sala {
    const s = this.salas.get(id);
    if (!s) throw new ErroSala(404, "Sala não encontrada.");
    if (this.temAcesso(s, u)) return s;
    const convite = typeof credenciais.convite === "string" ? credenciais.convite : "";
    const conviteOk = convite.length > 0 && convite.length === s.codigoConvite.length
      && crypto.timingSafeEqual(Buffer.from(convite), Buffer.from(s.codigoConvite));
    if (s.tipo === "privada" && !conviteOk) throw new ErroSala(404, "Sala não encontrada.");
    if (s.tipo === "senha" && !conviteOk && !(typeof credenciais.senha === "string" && s.senhaHash && conferirSenha(credenciais.senha, s.senhaHash)))
      throw new ErroSala(403, "Senha incorreta.");
    s.participantes.push(u.username);
    this.salvar(s);
    return s;
  }
  convidar(id: string, u: Usuario, usuarios: unknown): Sala {
    const s = this.obter(id, u);
    if (s.dono !== u.username) throw new ErroSala(403, "Só o dono da sala convida.");
    s.convidados = [...new Set([...s.convidados, ...normalizarUsuarios(usuarios).filter(n => n !== s.dono)])];
    this.salvar(s);
    this.avisar(s);
    return s;
  }
  excluir(id: string, u: Usuario): void {
    const s = this.obter(id, u);
    if (s.dono !== u.username && u.role !== "admin") throw new ErroSala(403, "Só o dono exclui a sala.");
    this.salas.delete(id);
    this.db.prepare("DELETE FROM salas WHERE id = ?").run(id);
    s.membros.clear();
    s.reproducao = { ...s.reproducao, estado: "parado", versao: s.reproducao.versao + 1 };
    this.avisar(s);
  }

  // ---------- presença ----------
  conectar(s: Sala, u: Usuario): void {
    const m = s.membros.get(u.username) ?? { username: u.username, nome: u.nome, conexoes: 0, ping: PING_PADRAO_MS, carregando: false };
    m.conexoes++;
    s.membros.set(u.username, m);
    this.avisar(s);
  }
  desconectar(s: Sala, u: Usuario): void {
    const m = s.membros.get(u.username);
    if (!m) return;
    if (--m.conexoes <= 0) s.membros.delete(u.username);
    this.verificarEspera(s);
    this.avisar(s);
  }

  // ---------- reprodução (estados do SyncPlay) ----------
  /** Posição do grupo agora (s). */
  posicaoAtual(s: Sala): number {
    const r = s.reproducao;
    return r.estado === "tocando" ? Math.max(0, r.posicao + (this.agora() - r.quando) / 1000) : r.posicao;
  }
  private maiorPing(s: Sala): number {
    let maior = 0;
    for (const m of s.membros.values()) maior = Math.max(maior, m.ping);
    return maior;
  }
  private mudar(s: Sala, parcial: Partial<Reproducao>): void {
    s.reproducao = { ...s.reproducao, ...parcial, versao: s.reproducao.versao + 1 };
    this.avisar(s);
  }
  private agendarInicio(s: Sala, posicao: number): void {
    // PlayingGroupState: delay = max(maior ping × 2, DefaultPing) — todos recebem antes do instante combinado.
    const atraso = Math.max(this.maiorPing(s) * 2, PING_PADRAO_MS);
    for (const m of s.membros.values()) m.carregando = false;
    s.esperaAte = null;
    this.mudar(s, { estado: "tocando", posicao, quando: this.agora() + atraso });
  }
  private aguardar(s: Sala, posicao: number): void {
    // WaitingGroupState: todos pausam no ponto e avisam "pronto"; quem não responde em ESPERA_MAXIMA_MS é ignorado.
    for (const m of s.membros.values()) m.carregando = true;
    s.esperaAte = this.agora() + ESPERA_MAXIMA_MS;
    this.mudar(s, { estado: "aguardando", posicao, quando: this.agora() });
  }
  /** Chamado periodicamente: encerra a espera por quem não respondeu. */
  verificarEspera(s: Sala): void {
    if (s.reproducao.estado !== "aguardando") return;
    const todosProntos = [...s.membros.values()].every(m => !m.carregando);
    if (todosProntos || (s.esperaAte !== null && this.agora() >= s.esperaAte)) this.agendarInicio(s, s.reproducao.posicao);
  }
  verificarTodas(): void { for (const s of this.salas.values()) this.verificarEspera(s); }

  comando(id: string, u: Usuario, c: { tipo?: unknown; posicao?: unknown; mediaId?: unknown; ping?: unknown }): Sala {
    const s = this.obter(id, u);
    if (!this.temAcesso(s, u)) throw new ErroSala(403, "Entre na sala primeiro.");
    const tipo = String(c.tipo ?? "");
    const posicao = Number(c.posicao);
    const membro = s.membros.get(u.username);
    if (tipo === "ping") { if (membro && Number.isFinite(Number(c.ping))) membro.ping = Math.min(5000, Math.max(0, Number(c.ping))); return s; }
    if (tipo === "carregando" || tipo === "pronto") {
      if (membro) membro.carregando = tipo === "carregando";
      // BufferGroupRequest no Playing → Waiting (todos pausam até quem travou carregar).
      if (tipo === "carregando" && s.reproducao.estado === "tocando") { this.aguardar(s, this.posicaoAtual(s)); if (membro) membro.carregando = true; }
      else this.verificarEspera(s);
      return s;
    }
    if (s.controle === "dono" && s.dono !== u.username) throw new ErroSala(403, "Nesta sala só o dono controla a reprodução.");
    const r = s.reproducao;
    switch (tipo) {
      case "filme": {
        if (typeof c.mediaId !== "string" || !c.mediaId) throw new ErroSala(400, "Escolha um filme.");
        this.mudar(s, { mediaId: c.mediaId, estado: "pausado", posicao: 0, quando: this.agora() });
        this.salvar(s);
        break;
      }
      case "tocar":
        if (!r.mediaId) throw new ErroSala(400, "Escolha um filme primeiro.");
        if (r.estado === "tocando") break;
        this.aguardar(s, Number.isFinite(posicao) ? Math.max(0, posicao) : this.posicaoAtual(s));
        this.verificarEspera(s);
        break;
      case "pausar":
        this.mudar(s, { estado: "pausado", posicao: Number.isFinite(posicao) ? Math.max(0, posicao) : this.posicaoAtual(s), quando: this.agora() });
        break;
      case "pular": {
        if (!Number.isFinite(posicao)) throw new ErroSala(400, "Posição inválida.");
        // SeekGroupRequest: tocando → todos esperam carregar o novo ponto; pausado → só move.
        if (r.estado === "tocando" || r.estado === "aguardando") { this.aguardar(s, Math.max(0, posicao)); this.verificarEspera(s); }
        else this.mudar(s, { posicao: Math.max(0, posicao), quando: this.agora() });
        break;
      }
      default: throw new ErroSala(400, "Comando desconhecido.");
    }
    return s;
  }

  /** O que cada pessoa recebe (sem senha nem código, exceto o código para o dono). */
  publico(s: Sala, u: Usuario) {
    return {
      id: s.id, nome: s.nome, tipo: s.tipo, dono: s.dono, controle: s.controle, souDono: s.dono === u.username,
      tenhoAcesso: this.temAcesso(s, u), convidado: s.convidados.includes(u.username),
      convidados: s.dono === u.username ? s.convidados : undefined,
      codigoConvite: s.dono === u.username ? s.codigoConvite : undefined,
      membros: [...s.membros.values()].map(m => ({ username: m.username, nome: m.nome, carregando: m.carregando })),
      reproducao: s.reproducao
    };
  }
  fechar(): void { this.db.close(); }
}
