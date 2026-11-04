// Banco do Painel (painel.db, separado do banco de progresso e do das salas): configuração das telas, usuários e
// dispositivos que já acessaram, registro de atividade e chaves da API.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { pagina, padroes, validar } from "./configuracao.js";

export interface Usuario {
  usuario: string; nome: string; papel: "admin" | "user"; desativado: boolean; oculto: boolean;
  limiteBitrateMbps: number; maxSessoes: number; acessoSalas: "criar" | "participar" | "nenhum";
  /** Usuários › Acesso à biblioteca e Controle dos pais (têm efeito no catálogo de quem não é administrador). */
  todasBibliotecas: boolean; bibliotecas: string[]; classificacaoMaxima: number | null; bloquearSemClassificacao: boolean;
  primeiroAcesso: string; ultimoAcesso: string;
}
export interface Dispositivo { id: string; usuario: string; nome: string; aplicativo: string; ip: string; ultimoAcesso: string }
export interface Evento { id: number; data: string; tipo: string; nivel: "Information" | "Warning" | "Error"; usuario: string | null; nome: string; detalhe: string }
export interface Chave { id: number; nome: string; prefixo: string; criadoEm: string; ultimoUso: string | null }

const sha256 = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** Nome legível do navegador/sistema a partir do User-Agent (como a coluna "Dispositivo" do Jellyfin). */
export function descreverNavegador(ua: string): { nome: string; aplicativo: string } {
  const navegador = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? (/Chromium/.test(ua) ? "Chromium" : "Chrome") : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const sistema = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Sistema desconhecido";
  return { nome: `${navegador} no ${sistema}`, aplicativo: "PugotiCine Web" };
}

export class BancoPainel {
  readonly db: Database.Database;
  constructor(readonly arquivo: string) {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    this.db = new Database(arquivo);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS configuracao (pagina TEXT PRIMARY KEY, valores TEXT NOT NULL, atualizadoEm TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usuarios (usuario TEXT PRIMARY KEY, nome TEXT NOT NULL, papel TEXT NOT NULL,
        desativado INTEGER NOT NULL DEFAULT 0, oculto INTEGER NOT NULL DEFAULT 0, limiteBitrateMbps REAL NOT NULL DEFAULT 0,
        maxSessoes INTEGER NOT NULL DEFAULT 0, acessoSalas TEXT NOT NULL DEFAULT 'criar', primeiroAcesso TEXT NOT NULL, ultimoAcesso TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dispositivos (id TEXT PRIMARY KEY, usuario TEXT NOT NULL, nome TEXT NOT NULL, aplicativo TEXT NOT NULL, ip TEXT NOT NULL, ultimoAcesso TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS atividade (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, tipo TEXT NOT NULL, nivel TEXT NOT NULL, usuario TEXT, nome TEXT NOT NULL, detalhe TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS chaves (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, prefixo TEXT NOT NULL, criadoEm TEXT NOT NULL, ultimoUso TEXT);
    `);
    const colunas = (this.db.prepare("PRAGMA table_info(usuarios)").all() as { name: string }[]).map(c => c.name);
    for (const [coluna, tipo] of [["todasBibliotecas", "INTEGER NOT NULL DEFAULT 1"], ["bibliotecas", "TEXT NOT NULL DEFAULT '[]'"], ["classificacaoMaxima", "INTEGER"], ["bloquearSemClassificacao", "INTEGER NOT NULL DEFAULT 0"]] as const)
      if (!colunas.includes(coluna)) this.db.exec(`ALTER TABLE usuarios ADD COLUMN ${coluna} ${tipo}`);
  }

  // ---------- configuração ----------
  ler(id: string): Record<string, unknown> {
    const p = pagina(id);
    if (!p) throw new Error("Página inexistente.");
    const linha = this.db.prepare("SELECT valores FROM configuracao WHERE pagina = ?").get(id) as { valores: string } | undefined;
    return { ...padroes(p), ...(linha ? JSON.parse(linha.valores) : {}) };
  }
  /** A página já foi salva alguma vez (senão valem os padrões, e o player usa as variáveis do container). */
  foiSalva(id: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM configuracao WHERE pagina = ?").get(id));
  }
  salvar(id: string, entrada: Record<string, unknown>): Record<string, unknown> {
    const p = pagina(id);
    if (!p) throw new Error("Página inexistente.");
    const valores = validar(p, entrada, this.ler(id));
    this.db.prepare("INSERT INTO configuracao (pagina, valores, atualizadoEm) VALUES (?, ?, ?) ON CONFLICT(pagina) DO UPDATE SET valores = excluded.valores, atualizadoEm = excluded.atualizadoEm")
      .run(id, JSON.stringify(valores), new Date().toISOString());
    return valores;
  }

  // ---------- usuários e dispositivos ----------
  /** Registra o acesso (usuário + navegador). Devolve true quando é um dispositivo novo ou voltou depois de 30 min. */
  registrarAcesso(usuario: string, nome: string, papel: "admin" | "user", userAgent: string, ip: string): boolean {
    const agora = new Date().toISOString();
    this.db.prepare(`INSERT INTO usuarios (usuario, nome, papel, primeiroAcesso, ultimoAcesso) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(usuario) DO UPDATE SET nome = excluded.nome, papel = excluded.papel, ultimoAcesso = excluded.ultimoAcesso`).run(usuario, nome, papel, agora, agora);
    const id = sha256(`${usuario}\n${userAgent}`).slice(0, 20);
    const anterior = this.db.prepare("SELECT ultimoAcesso FROM dispositivos WHERE id = ?").get(id) as { ultimoAcesso: string } | undefined;
    const { nome: nomeDispositivo, aplicativo } = descreverNavegador(userAgent);
    this.db.prepare(`INSERT INTO dispositivos (id, usuario, nome, aplicativo, ip, ultimoAcesso) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET ip = excluded.ip, ultimoAcesso = excluded.ultimoAcesso`).run(id, usuario, nomeDispositivo, aplicativo, ip, agora);
    return !anterior || Date.now() - Date.parse(anterior.ultimoAcesso) > 30 * 60_000;
  }
  usuario(usuario: string): Usuario | null {
    const r = this.db.prepare("SELECT * FROM usuarios WHERE usuario = ?").get(usuario) as Record<string, unknown> | undefined;
    return r ? this.paraUsuario(r) : null;
  }
  usuarios(): Usuario[] {
    return (this.db.prepare("SELECT * FROM usuarios ORDER BY nome COLLATE NOCASE").all() as Record<string, unknown>[]).map(r => this.paraUsuario(r));
  }
  private paraUsuario(r: Record<string, unknown>): Usuario {
    return { usuario: String(r.usuario), nome: String(r.nome), papel: r.papel === "admin" ? "admin" : "user", desativado: Boolean(r.desativado), oculto: Boolean(r.oculto),
      limiteBitrateMbps: Number(r.limiteBitrateMbps), maxSessoes: Number(r.maxSessoes), acessoSalas: r.acessoSalas as Usuario["acessoSalas"],
      todasBibliotecas: r.todasBibliotecas === undefined ? true : Boolean(r.todasBibliotecas), bibliotecas: JSON.parse(String(r.bibliotecas ?? "[]")),
      classificacaoMaxima: r.classificacaoMaxima === null || r.classificacaoMaxima === undefined ? null : Number(r.classificacaoMaxima),
      bloquearSemClassificacao: Boolean(r.bloquearSemClassificacao), primeiroAcesso: String(r.primeiroAcesso), ultimoAcesso: String(r.ultimoAcesso) };
  }
  atualizarUsuario(usuario: string, dados: Partial<Pick<Usuario, "desativado" | "oculto" | "limiteBitrateMbps" | "maxSessoes" | "acessoSalas" | "todasBibliotecas" | "bibliotecas" | "classificacaoMaxima" | "bloquearSemClassificacao">>): Usuario {
    const atual = this.usuario(usuario);
    if (!atual) throw new Error("Usuário não encontrado.");
    const novo = { ...atual };
    if (dados.desativado !== undefined) { if (typeof dados.desativado !== "boolean") throw new Error("Valor inválido."); novo.desativado = dados.desativado; }
    if (dados.oculto !== undefined) { if (typeof dados.oculto !== "boolean") throw new Error("Valor inválido."); novo.oculto = dados.oculto; }
    if (dados.limiteBitrateMbps !== undefined) { const n = Number(dados.limiteBitrateMbps); if (!Number.isFinite(n) || n < 0 || n > 1000) throw new Error("Limite do bitrate inválido (0 a 1000 Mbps)."); novo.limiteBitrateMbps = n; }
    if (dados.maxSessoes !== undefined) { const n = Number(dados.maxSessoes); if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error("Número máximo de sessões inválido (0 a 100)."); novo.maxSessoes = n; }
    if (dados.acessoSalas !== undefined) { if (!["criar", "participar", "nenhum"].includes(dados.acessoSalas)) throw new Error("Acesso às salas inválido."); novo.acessoSalas = dados.acessoSalas; }
    if (dados.todasBibliotecas !== undefined) { if (typeof dados.todasBibliotecas !== "boolean") throw new Error("Valor inválido."); novo.todasBibliotecas = dados.todasBibliotecas; }
    if (dados.bibliotecas !== undefined) {
      if (!Array.isArray(dados.bibliotecas) || dados.bibliotecas.some(b => typeof b !== "string" || !/^[a-z0-9-]{1,40}$/.test(b))) throw new Error("Bibliotecas inválidas.");
      novo.bibliotecas = [...new Set(dados.bibliotecas)];
    }
    if (dados.classificacaoMaxima !== undefined) {
      const v = dados.classificacaoMaxima === null || (dados.classificacaoMaxima as unknown) === "" ? null : Number(dados.classificacaoMaxima);
      if (v !== null && ![0, 10, 12, 14, 16, 18].includes(v)) throw new Error("Classificação etária inválida.");
      novo.classificacaoMaxima = v;
    }
    if (dados.bloquearSemClassificacao !== undefined) { if (typeof dados.bloquearSemClassificacao !== "boolean") throw new Error("Valor inválido."); novo.bloquearSemClassificacao = dados.bloquearSemClassificacao; }
    this.db.prepare("UPDATE usuarios SET desativado = ?, oculto = ?, limiteBitrateMbps = ?, maxSessoes = ?, acessoSalas = ?, todasBibliotecas = ?, bibliotecas = ?, classificacaoMaxima = ?, bloquearSemClassificacao = ? WHERE usuario = ?")
      .run(novo.desativado ? 1 : 0, novo.oculto ? 1 : 0, novo.limiteBitrateMbps, novo.maxSessoes, novo.acessoSalas, novo.todasBibliotecas ? 1 : 0, JSON.stringify(novo.bibliotecas), novo.classificacaoMaxima, novo.bloquearSemClassificacao ? 1 : 0, usuario);
    return novo;
  }
  excluirUsuario(usuario: string): void {
    this.db.prepare("DELETE FROM usuarios WHERE usuario = ?").run(usuario);
    this.db.prepare("DELETE FROM dispositivos WHERE usuario = ?").run(usuario);
  }
  dispositivos(): Dispositivo[] {
    return this.db.prepare("SELECT * FROM dispositivos ORDER BY ultimoAcesso DESC").all() as Dispositivo[];
  }
  excluirDispositivo(id: string): boolean { return this.db.prepare("DELETE FROM dispositivos WHERE id = ?").run(id).changes > 0; }
  excluirDispositivos(): number { return this.db.prepare("DELETE FROM dispositivos").run().changes; }

  // ---------- atividade ----------
  registrar(tipo: string, nome: string, usuario: string | null = null, detalhe = "", nivel: Evento["nivel"] = "Information"): void {
    this.db.prepare("INSERT INTO atividade (data, tipo, nivel, usuario, nome, detalhe) VALUES (?, ?, ?, ?, ?, ?)").run(new Date().toISOString(), tipo, nivel, usuario, nome, detalhe);
  }
  /** Tarefa "Limpar Registro de Atividades": apaga o que passou da retenção (ActivityLogRetentionDays, 30 dias). */
  limparAtividade(dias = 30): number {
    return this.db.prepare("DELETE FROM atividade WHERE data < ?").run(new Date(Date.now() - dias * 86_400_000).toISOString()).changes;
  }
  atividade(filtro: { usuario?: "sim" | "nao"; limite?: number } = {}): Evento[] {
    const onde = filtro.usuario === "sim" ? "WHERE usuario IS NOT NULL" : filtro.usuario === "nao" ? "WHERE usuario IS NULL" : "";
    return this.db.prepare(`SELECT * FROM atividade ${onde} ORDER BY id DESC LIMIT ?`).all(Math.min(500, filtro.limite ?? 100)) as Evento[];
  }

  // ---------- chaves da API ----------
  /** Cria a chave e devolve o valor completo uma única vez (só o hash fica guardado). */
  criarChave(nome: string): { chave: Chave; token: string } {
    const limpo = String(nome ?? "").trim();
    if (!limpo || limpo.length > 80) throw new Error("Nome do app: informe de 1 a 80 caracteres.");
    const token = crypto.randomBytes(24).toString("hex");
    const r = this.db.prepare("INSERT INTO chaves (nome, hash, prefixo, criadoEm) VALUES (?, ?, ?, ?)").run(limpo, sha256(token), token.slice(0, 8), new Date().toISOString());
    return { chave: { id: Number(r.lastInsertRowid), nome: limpo, prefixo: token.slice(0, 8), criadoEm: new Date().toISOString(), ultimoUso: null }, token };
  }
  chaves(): Chave[] { return this.db.prepare("SELECT id, nome, prefixo, criadoEm, ultimoUso FROM chaves ORDER BY id DESC").all() as Chave[]; }
  revogarChave(id: number): boolean { return this.db.prepare("DELETE FROM chaves WHERE id = ?").run(id).changes > 0; }
  /** Nome da chave se o token vale (comparação pelo hash, sem guardar o token). */
  validarChave(token: string): string | null {
    if (!/^[0-9a-f]{48}$/.test(token)) return null;
    const r = this.db.prepare("SELECT id, nome FROM chaves WHERE hash = ?").get(sha256(token)) as { id: number; nome: string } | undefined;
    if (!r) return null;
    this.db.prepare("UPDATE chaves SET ultimoUso = ? WHERE id = ?").run(new Date().toISOString(), r.id);
    return r.nome;
  }

  fechar(): void { this.db.close(); }
}
