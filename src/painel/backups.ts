// Backups (Painel › Avançado › Backups): um .tar com cópias consistentes dos bancos SQLite (API de backup do
// SQLite, segura com WAL) e um manifest.json. Criar, listar, baixar e excluir funcionam; restaurar ainda não.
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

export class Backups {
  constructor(readonly pasta: string, private readonly fontes: FonteBackup[], private readonly versao: string) { fs.mkdirSync(pasta, { recursive: true }); }

  async criar(): Promise<Backup> {
    const carimbo = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const nome = `pugoticine-backup-${carimbo}.tar`;
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
  excluir(nome: string): boolean {
    const arquivo = this.caminho(nome);
    if (!arquivo) return false;
    fs.rmSync(arquivo);
    return true;
  }
}
