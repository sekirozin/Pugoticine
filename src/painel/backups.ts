// Backups (Painel › Avançado › Backups): um .tar com cópias consistentes dos bancos SQLite (API de backup do
// SQLite, segura com WAL) e um manifest.json. Criar, listar, baixar, excluir e restaurar. Restaurar é em duas fases,
// como o BackupService do Jellyfin (que restaura ao reiniciar): o backup é validado, um backup de segurança é criado,
// os bancos vão para data/restauracao-pendente e são aplicados na próxima inicialização, antes de qualquer banco abrir.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export interface Backup { nome: string; tamanho: number; criadoEm: string }
export interface FonteBackup { nome: string; arquivo: string }
const NOME = /^pugoticine-backup-\d{14}\.tar$/;

/** Cabeçalho ustar de 512 bytes. */
function cabecalhoTar(nome: string, tamanho: number, mtime: number): Buffer {
  const h = Buffer.alloc(512);
  const escrever = (texto: string, inicio: number, largura: number) => h.write(texto.slice(0, largura), inicio, "ascii");
  const octal = (n: number, largura: number) => n.toString(8).padStart(largura - 1, "0") + "\0";
  escrever(nome, 0, 100);
  escrever(octal(0o644, 8), 100, 8);
  escrever(octal(0, 8), 108, 8);
  escrever(octal(0, 8), 116, 8);
  escrever(octal(tamanho, 12), 124, 12);
  escrever(octal(Math.floor(mtime / 1000), 12), 136, 12);
  h.fill(" ", 148, 156);
  escrever("0", 156, 1);
  escrever("ustar\0", 257, 6);
  escrever("00", 263, 2);
  let soma = 0;
  for (const byte of h) soma += byte;
  escrever(soma.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return h;
}

export function montarTar(arquivos: { nome: string; dados: Buffer }[]): Buffer {
  const partes: Buffer[] = [];
  const agora = Date.now();
  for (const a of arquivos) {
    partes.push(cabecalhoTar(a.nome, a.dados.length, agora), a.dados);
    const resto = a.dados.length % 512;
    if (resto) partes.push(Buffer.alloc(512 - resto));
  }
  partes.push(Buffer.alloc(1024));
  return Buffer.concat(partes);
}

/** Lê um .tar ustar (só arquivos regulares, sem caminhos). */
export function lerTar(dados: Buffer): { nome: string; dados: Buffer }[] {
  const arquivos: { nome: string; dados: Buffer }[] = [];
  let pos = 0;
  while (pos + 512 <= dados.length) {
    const h = dados.subarray(pos, pos + 512);
    if (h.every(b => b === 0)) return arquivos;
    const texto = (inicio: number, largura: number) => h.subarray(inicio, inicio + largura).toString("ascii").replace(/\0.*$/s, "").trim();
    const nome = texto(0, 100), tamanho = parseInt(texto(124, 12) || "0", 8), tipo = texto(156, 1) || "0";
    let soma = 0;
    for (let i = 0; i < 512; i++) soma += i >= 148 && i < 156 ? 32 : h[i];
    if (!Number.isFinite(tamanho) || tamanho < 0 || soma !== parseInt(texto(148, 8), 8)) throw new Error("Arquivo de backup corrompido.");
    if (pos + 512 + tamanho > dados.length) throw new Error("Arquivo de backup incompleto.");
    if (tipo === "0") arquivos.push({ nome, dados: Buffer.from(dados.subarray(pos + 512, pos + 512 + tamanho)) });
    pos += 512 + Math.ceil(tamanho / 512) * 512;
  }
  throw new Error("Arquivo de backup incompleto.");
}

export interface Restauracao { backup: string; seguranca: string; arquivos: string[]; agendadaEm: string }

/**
 * Aplica a restauração pendente (chamar na inicialização, antes de abrir os bancos). Cada banco é trocado por
 * cópia + rename e os -wal/-shm antigos são apagados, para o SQLite não reaplicar o diário do banco anterior.
 */
export function aplicarRestauracaoPendente(pastaPendente: string, fontes: FonteBackup[]): Restauracao | null {
  const manifesto = path.join(pastaPendente, "restauracao.json");
  if (!fs.existsSync(manifesto)) return null;
  const pedido = JSON.parse(fs.readFileSync(manifesto, "utf8")) as Restauracao;
  for (const nome of pedido.arquivos) {
    const fonte = fontes.find(f => f.nome === nome);
    if (!fonte) continue;
    fs.copyFileSync(path.join(pastaPendente, nome), `${fonte.arquivo}.restaurando`);
    for (const extra of ["-wal", "-shm"]) fs.rmSync(fonte.arquivo + extra, { force: true });
    fs.renameSync(`${fonte.arquivo}.restaurando`, fonte.arquivo);
  }
  fs.rmSync(pastaPendente, { recursive: true, force: true });
  return pedido;
}

export class Backups {
  constructor(readonly pasta: string, readonly fontes: FonteBackup[], private readonly versao: string) { fs.mkdirSync(pasta, { recursive: true }); }

  async criar(): Promise<Backup> {
    // Nunca sobrescreve: dois backups no mesmo segundo (ex.: o de segurança antes de restaurar) avançam um segundo.
    let momento = Date.now(), nome: string;
    do { nome = `pugoticine-backup-${new Date(momento).toISOString().replace(/\D/g, "").slice(0, 14)}.tar`; momento += 1000; }
    while (fs.existsSync(path.join(this.pasta, nome)));
    const temporaria = fs.mkdtempSync(path.join(this.pasta, ".novo-"));
    try {
      const arquivos: { nome: string; dados: Buffer }[] = [];
      const incluidos: string[] = [];
      for (const f of this.fontes) {
        if (!fs.existsSync(f.arquivo)) continue;
        const destino = path.join(temporaria, f.nome);
        const banco = new Database(f.arquivo, { readonly: true });
        try { await banco.backup(destino); } finally { banco.close(); }
        arquivos.push({ nome: f.nome, dados: fs.readFileSync(destino) });
        incluidos.push(f.nome);
      }
      const manifesto = { aplicativo: "PugotiCine", versao: this.versao, criadoEm: new Date().toISOString(), arquivos: incluidos };
      arquivos.unshift({ nome: "manifest.json", dados: Buffer.from(JSON.stringify(manifesto, null, 2)) });
      const final = path.join(this.pasta, nome);
      fs.writeFileSync(`${final}.tmp`, montarTar(arquivos));
      fs.renameSync(`${final}.tmp`, final);
      return { nome, tamanho: fs.statSync(final).size, criadoEm: manifesto.criadoEm };
    } finally {
      fs.rmSync(temporaria, { recursive: true, force: true });
    }
  }

  listar(): Backup[] {
    return fs.readdirSync(this.pasta).filter(n => NOME.test(n)).map(nome => {
      const s = fs.statSync(path.join(this.pasta, nome));
      return { nome, tamanho: s.size, criadoEm: s.mtime.toISOString() };
    }).sort((a, b) => b.nome.localeCompare(a.nome));
  }
  caminho(nome: string): string | null {
    if (!NOME.test(nome)) return null;
    const arquivo = path.join(this.pasta, nome);
    return fs.existsSync(arquivo) ? arquivo : null;
  }
  get pastaPendente(): string { return path.join(path.dirname(this.pasta), "restauracao-pendente"); }

  /** Valida um backup: manifesto do PugotiCine, só bancos conhecidos e integridade de cada SQLite. */
  validar(nome: string): { manifesto: { aplicativo: string; versao: string; criadoEm: string; arquivos: string[] }; arquivos: { nome: string; dados: Buffer }[] } {
    const arquivo = this.caminho(nome);
    if (!arquivo) throw new Error("Backup não encontrado.");
    const conteudo = lerTar(fs.readFileSync(arquivo));
    const bruto = conteudo.find(a => a.nome === "manifest.json");
    if (!bruto) throw new Error("O backup não tem manifest.json.");
    let manifesto;
    try { manifesto = JSON.parse(bruto.dados.toString("utf8")); } catch { throw new Error("manifest.json inválido."); }
    if (manifesto?.aplicativo !== "PugotiCine") throw new Error("Este backup não é do PugotiCine.");
    const conhecidos = new Set(this.fontes.map(f => f.nome));
    const bancos = conteudo.filter(a => a.nome !== "manifest.json");
    if (!bancos.length) throw new Error("O backup não tem bancos de dados.");
    const temporaria = fs.mkdtempSync(path.join(this.pasta, ".validar-"));
    try {
      for (const b of bancos) {
        if (!conhecidos.has(b.nome)) throw new Error(`Arquivo desconhecido no backup: ${b.nome}`);
        const alvo = path.join(temporaria, b.nome);
        fs.writeFileSync(alvo, b.dados);
        let ok = false;
        try { const db = new Database(alvo, { readonly: true, fileMustExist: true }); try { ok = db.pragma("integrity_check", { simple: true }) === "ok"; } finally { db.close(); } }
        catch { ok = false; }
        if (!ok) throw new Error(`O banco ${b.nome} do backup está corrompido.`);
      }
    } finally { fs.rmSync(temporaria, { recursive: true, force: true }); }
    return { manifesto, arquivos: bancos };
  }

  /** Agenda a restauração: valida, cria o backup de segurança e deixa os bancos esperando a reinicialização. */
  async agendarRestauracao(nome: string): Promise<Restauracao> {
    const { arquivos } = this.validar(nome);
    const seguranca = await this.criar();
    const pendente = this.pastaPendente;
    fs.rmSync(pendente, { recursive: true, force: true });
    fs.mkdirSync(pendente, { recursive: true });
    for (const a of arquivos) fs.writeFileSync(path.join(pendente, a.nome), a.dados);
    const pedido: Restauracao = { backup: nome, seguranca: seguranca.nome, arquivos: arquivos.map(a => a.nome), agendadaEm: new Date().toISOString() };
    fs.writeFileSync(path.join(pendente, "restauracao.json"), JSON.stringify(pedido, null, 2));
    return pedido;
  }
  restauracaoPendente(): Restauracao | null {
    const f = path.join(this.pastaPendente, "restauracao.json");
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  }
  cancelarRestauracao(): boolean {
    const havia = this.restauracaoPendente() !== null;
    fs.rmSync(this.pastaPendente, { recursive: true, force: true });
    return havia;
  }

  excluir(nome: string): boolean {
    const arquivo = this.caminho(nome);
    if (!arquivo) return false;
    fs.rmSync(arquivo);
    return true;
  }
}
