// Registros (Painel › Avançado › Registros): o que o processo escreve no console também vai para
// log_AAAAMMDD.log na pasta de dados, como os arquivos de log do Jellyfin. Guarda 7 dias.
import fs from "node:fs";
import path from "node:path";
import { format } from "node:util";

export interface ArquivoRegistro { nome: string; tamanho: number; modificadoEm: string }
const NOME = /^log_\d{8}\.log$/;
const LIMITE_LEITURA = 2 * 1024 * 1024;

export class Registros {
  private instalado = false;
  constructor(readonly pasta: string, private readonly diasGuardados = 7) { fs.mkdirSync(pasta, { recursive: true }); }

  private arquivoDoDia(data = new Date()): string {
    const d = data.toISOString().slice(0, 10).replaceAll("-", "");
    return path.join(this.pasta, `log_${d}.log`);
  }

  escrever(nivel: "INF" | "WRN" | "ERR", mensagem: string): void {
    const agora = new Date();
    const linha = `[${agora.toISOString().replace("T", " ").replace("Z", "")}] [${nivel}] ${mensagem}\n`;
    try { fs.appendFileSync(this.arquivoDoDia(agora), linha); } catch { /* disco cheio: o console continua */ }
  }

  /** Passa a copiar console.log/info/warn/error para o arquivo do dia. */
  instalar(): void {
    if (this.instalado) return;
    this.instalado = true;
    this.limpar();
    for (const [metodo, nivel] of [["log", "INF"], ["info", "INF"], ["warn", "WRN"], ["error", "ERR"]] as const) {
      const original = console[metodo].bind(console);
      console[metodo] = (...args: unknown[]) => { original(...args); this.escrever(nivel, format(...args)); };
    }
  }

  limpar(): void {
    const limite = Date.now() - this.diasGuardados * 86_400_000;
    for (const a of this.arquivos()) if (Date.parse(a.modificadoEm) < limite) fs.rmSync(path.join(this.pasta, a.nome), { force: true });
  }

  arquivos(): ArquivoRegistro[] {
    return fs.readdirSync(this.pasta).filter(n => NOME.test(n)).map(nome => {
      const s = fs.statSync(path.join(this.pasta, nome));
      return { nome, tamanho: s.size, modificadoEm: s.mtime.toISOString() };
    }).sort((a, b) => b.nome.localeCompare(a.nome));
  }

  /** Conteúdo do arquivo (os últimos 2 MB, se for maior). */
  ler(nome: string): string | null {
    if (!NOME.test(nome)) return null;
    const arquivo = path.join(this.pasta, nome);
    if (!fs.existsSync(arquivo)) return null;
    const tamanho = fs.statSync(arquivo).size;
    const inicio = Math.max(0, tamanho - LIMITE_LEITURA);
    const fd = fs.openSync(arquivo, "r");
    try {
      const buffer = Buffer.alloc(tamanho - inicio);
      fs.readSync(fd, buffer, 0, buffer.length, inicio);
      return buffer.toString("utf8");
    } finally { fs.closeSync(fd); }
  }
}
