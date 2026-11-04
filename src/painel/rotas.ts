// Rotas do Painel (só administrador, exceto /api/marca). Cada tela do menu do Painel do Jellyfin tem sua rota; o que
// já tem efeito no PugotiCine funciona de verdade, o resto é salvo e a tela avisa (ver efeito em configuracao.ts).
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MediaItem, PugotiProfile } from "../types.js";
import { BancoPainel } from "./banco.js";
import { Backups } from "./backups.js";
import { ErroValidacao, PAGINAS, pagina } from "./configuracao.js";
import { disco, infoServidor, montarPainel, type RegistroAtividade } from "./painel.js";
import { Registros } from "./registros.js";

type Json = (res: ServerResponse, status: number, corpo: unknown) => void;
type Corpo = <T>(req: IncomingMessage) => Promise<T>;
export interface ContextoPainel {
  banco: BancoPainel; registros: Registros; backups: Backups; json: Json; corpo: Corpo;
  catalogo: () => MediaItem[]; ultimaVarredura: () => string; atividadeProgresso: () => RegistroAtividade[];
  varrer: () => Promise<number>; atualizarMetadados: () => Promise<void>;
  intervaloMs: number; raizMidia: string; pastaDados: string; ffmpeg: string; versao: string;
}
interface EstadoTarefa { ultimaExecucao: string | null; duracaoMs: number | null; resultado: "Completed" | "Failed" | null; erro: string | null; executando: boolean }

const CABECALHOS_CHAVE = ["x-pugoticine-token", "x-emby-token", "x-mediabrowser-token"];

export class RotasPainel {
  private readonly ultimosRegistros = new Map<string, number>();
  readonly tarefas: Record<"varredura" | "metadados", EstadoTarefa> = {
    varredura: { ultimaExecucao: null, duracaoMs: null, resultado: null, erro: null, executando: false },
    metadados: { ultimaExecucao: null, duracaoMs: null, resultado: null, erro: null, executando: false }
  };
  constructor(private readonly c: ContextoPainel) {}

  /** Perfil de administrador para quem chama a API com uma chave válida (Chaves da API). */
  perfilPorChave(req: IncomingMessage): PugotiProfile | null {
    let token = "";
    for (const nome of CABECALHOS_CHAVE) { const v = req.headers[nome]; if (typeof v === "string" && v) { token = v.trim(); break; } }
    if (!token) token = /Token="?([0-9a-f]{48})"?/.exec(String(req.headers.authorization ?? ""))?.[1] ?? "";
    const nome = token ? this.c.banco.validarChave(token) : null;
    return nome ? { username: `chave:${nome}`, displayName: `Chave da API: ${nome}`, nickname: "", avatarUrl: "", role: "admin" } : null;
  }

  /** Registra o acesso (no máximo uma escrita por minuto por navegador) e bloqueia usuário desativado. */
  verificarAcesso(perfil: PugotiProfile, req: IncomingMessage): string | null {
    if (perfil.username.startsWith("chave:")) return null;
    const ua = String(req.headers["user-agent"] ?? "");
    const chave = `${perfil.username}\n${ua}`;
    if (Date.now() - (this.ultimosRegistros.get(chave) ?? 0) > 60_000) {
      this.ultimosRegistros.set(chave, Date.now());
      const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
      if (this.c.banco.registrarAcesso(perfil.username, perfil.displayName, perfil.role, ua, ip))
        this.c.banco.registrar("SessionStarted", `${perfil.displayName} está online no PugotiCine Web`, perfil.username);
    }
    return this.c.banco.usuario(perfil.username)?.desativado ? "Sua conta está desativada neste servidor. Fale com o administrador." : null;
  }

  registrarReproducao(perfil: PugotiProfile, media: MediaItem): void {
    this.c.banco.registrar("VideoPlayback", `${perfil.displayName} está reproduzindo ${media.title}`, perfil.username);
  }

  /** Limite para marcar como assistido (Reprodução › Retomar › Porcentagem máxima). */
  limiteConcluido(): number { return Number(this.c.banco.ler("reproducao-retomar").MaxResumePct) / 100; }
  /** Opções de reprodução para o player (Transcodificação, Retomar, Transmissão, Pré-visualizações). */
  configuracaoReproducao() {
    return { transcodificacao: this.c.banco.ler("reproducao-transcodificacao"), retomar: this.c.banco.ler("reproducao-retomar"),
      transmissao: this.c.banco.ler("reproducao-streaming"), previsualizacoes: this.c.banco.ler("reproducao-trickplay") };
  }
  respostaLenta(): number | null {
    const r = this.c.banco.ler("registros");
    return r.EnableSlowResponseWarning ? Number(r.SlowResponseThresholdMs) : null;
  }

  async executarTarefa(id: "varredura" | "metadados"): Promise<EstadoTarefa> {
    const t = this.tarefas[id];
    if (t.executando) return t;
    t.executando = true;
    const inicio = Date.now();
    try {
      if (id === "varredura") { const n = await this.c.varrer(); this.c.banco.registrar("TaskCompleted", `Varrer a biblioteca de mídia concluída: ${n} filme(s)`); }
      else { await this.c.atualizarMetadados(); this.c.banco.registrar("TaskCompleted", "Atualizar metadados do Radarr concluída"); }
      t.resultado = "Completed"; t.erro = null;
    } catch (erro) {
      t.resultado = "Failed"; t.erro = erro instanceof Error ? erro.message : String(erro);
      this.c.banco.registrar("TaskFailed", `${id === "varredura" ? "Varrer a biblioteca de mídia" : "Atualizar metadados do Radarr"} falhou`, null, t.erro, "Error");
    } finally {
      t.executando = false; t.ultimaExecucao = new Date().toISOString(); t.duracaoMs = Date.now() - inicio;
    }
    return t;
  }

  private visaoGeral() {
    const geral = this.c.banco.ler("geral");
    const servidor = { ...infoServidor(this.c.versao, this.c.ffmpeg), nome: String(geral.ServerName) };
    return montarPainel({ catalogo: this.c.catalogo(), ultimaVarredura: this.c.ultimaVarredura(), intervaloVarreduraMs: this.c.intervaloMs,
      raizMidia: this.c.raizMidia, atividade: this.c.atividadeProgresso(), agora: new Date(), servidor,
      discos: [disco(this.c.raizMidia, "Mídia"), disco(this.c.pastaDados, "Dados do PugotiCine")] });
  }

  private listaTarefas() {
    const proxima = (t: EstadoTarefa) => {
      const base = t.ultimaExecucao ?? this.c.ultimaVarredura();
      return base ? new Date(Date.parse(base) + this.c.intervaloMs).toISOString() : null;
    };
    return ([["varredura", "Varrer a biblioteca de mídia", "Biblioteca", "Procura arquivos novos ou removidos na pasta de filmes."],
      ["metadados", "Atualizar metadados do Radarr", "Metadados", "Busca sinopse, pôster e notas dos filmes no Radarr."]] as const).map(([id, nome, categoria, descricao]) => {
      const t = this.tarefas[id];
      return { id, nome, categoria, descricao, intervaloMinutos: Math.round(this.c.intervaloMs / 60000), ...t,
        ultimaExecucao: t.ultimaExecucao ?? (this.c.ultimaVarredura() || null), proximaExecucao: proxima(t) };
    });
  }

  /** Trata as rotas do Painel; devolve true se a requisição era dele. */
  async tratar(req: IncomingMessage, res: ServerResponse, url: URL, perfil: PugotiProfile): Promise<boolean> {
    const { json, banco } = this.c;
    const caminho = url.pathname;
    if (caminho === "/api/marca" && req.method === "GET") {
      const marca = banco.ler("marca"), geral = banco.ler("geral");
      json(res, 200, { nomeServidor: geral.ServerName, cssPersonalizado: marca.CustomCss, versao: this.c.versao });
      return true;
    }
    if (!caminho.startsWith("/api/painel") && caminho !== "/api/configuracao/reproducao") return false;
    if (perfil.role !== "admin") { json(res, 403, { error: "Apenas administradores podem abrir o Painel." }); return true; }
    const m = (re: RegExp) => re.exec(caminho);
    const metodo = req.method ?? "GET";
    try {
      if (caminho === "/api/painel" && metodo === "GET") { json(res, 200, this.visaoGeral()); return true; }
      if (caminho === "/api/configuracao/reproducao" && metodo === "GET") { json(res, 200, this.configuracaoReproducao()); return true; }
      if (caminho === "/api/painel/paginas" && metodo === "GET") {
        json(res, 200, { paginas: PAGINAS.map(({ secoes: _s, ...p }) => p) });
        return true;
      }
      let r = m(/^\/api\/painel\/config\/([a-z-]+)$/);
      if (r) {
        const p = pagina(r[1]);
        if (!p || !p.secoes.length) { json(res, 404, { error: "Página sem configurações." }); return true; }
        if (metodo === "GET") { json(res, 200, { pagina: p, valores: banco.ler(p.id) }); return true; }
        if (metodo === "PUT") {
          const valores = banco.salvar(p.id, await this.c.corpo<Record<string, unknown>>(req));
          banco.registrar("ConfigurationUpdated", `Configuração alterada: ${p.titulo}`, perfil.username);
          json(res, 200, { pagina: p, valores });
          return true;
        }
      }
      if (caminho === "/api/painel/usuarios" && metodo === "GET") { json(res, 200, { usuarios: banco.usuarios(), voce: perfil.username }); return true; }
      r = m(/^\/api\/painel\/usuarios\/([a-z0-9._-]{1,64})$/);
      if (r) {
        const alvo = r[1];
        if (metodo === "PUT") {
          const dados = await this.c.corpo<Record<string, never>>(req);
          if (alvo === perfil.username && dados.desativado === true) { json(res, 400, { error: "Você não pode desativar a própria conta." }); return true; }
          const usuario = banco.atualizarUsuario(alvo, dados);
          banco.registrar("UserConfigurationUpdated", `Configuração do usuário ${usuario.nome} alterada${dados.desativado !== undefined ? usuario.desativado ? " (desativado)" : " (reativado)" : ""}`, perfil.username);
          json(res, 200, { usuario });
          return true;
        }
        if (metodo === "DELETE") {
          if (alvo === perfil.username) { json(res, 400, { error: "Você não pode excluir a própria conta." }); return true; }
          banco.excluirUsuario(alvo);
          banco.registrar("UserDeleted", `Usuário ${alvo} removido da lista (volta a aparecer se entrar de novo)`, perfil.username);
          json(res, 200, { ok: true });
          return true;
        }
      }
      if (caminho === "/api/painel/dispositivos" && metodo === "GET") { json(res, 200, { dispositivos: banco.dispositivos() }); return true; }
      if (caminho === "/api/painel/dispositivos" && metodo === "DELETE") { json(res, 200, { excluidos: banco.excluirDispositivos() }); return true; }
      r = m(/^\/api\/painel\/dispositivos\/([0-9a-f]{20})$/);
      if (r && metodo === "DELETE") { json(res, banco.excluirDispositivo(r[1]) ? 200 : 404, { ok: true }); return true; }
      if (caminho === "/api/painel/atividade" && metodo === "GET") {
        const tipo = url.searchParams.get("tipo");
        json(res, 200, { eventos: banco.atividade({ usuario: tipo === "usuario" ? "sim" : tipo === "sistema" ? "nao" : undefined, limite: 200 }) });
        return true;
      }
      if (caminho === "/api/painel/chaves" && metodo === "GET") { json(res, 200, { chaves: banco.chaves() }); return true; }
      if (caminho === "/api/painel/chaves" && metodo === "POST") {
        const { nome } = await this.c.corpo<{ nome?: string }>(req);
        const criada = banco.criarChave(String(nome ?? ""));
        banco.registrar("ApiKeyCreated", `Chave da API criada para ${criada.chave.nome}`, perfil.username);
        json(res, 201, criada);
        return true;
      }
      r = m(/^\/api\/painel\/chaves\/(\d+)$/);
      if (r && metodo === "DELETE") {
        const ok = banco.revogarChave(Number(r[1]));
        if (ok) banco.registrar("ApiKeyRevoked", "Chave da API revogada", perfil.username);
        json(res, ok ? 200 : 404, { ok });
        return true;
      }
      if (caminho === "/api/painel/backups" && metodo === "GET") { json(res, 200, { backups: this.c.backups.listar() }); return true; }
      if (caminho === "/api/painel/backups" && metodo === "POST") {
        const backup = await this.c.backups.criar();
        banco.registrar("BackupCreated", `Backup criado: ${backup.nome}`, perfil.username);
        json(res, 201, { backup });
        return true;
      }
      r = m(/^\/api\/painel\/backups\/(pugoticine-backup-\d{14}\.tar)(\/restaurar)?$/);
      if (r) {
        if (r[2] && metodo === "POST") { json(res, 501, { error: "Restaurar backup ainda não foi implementado no PugotiCine." }); return true; }
        const arquivo = this.c.backups.caminho(r[1]);
        if (!arquivo) { json(res, 404, { error: "Backup não encontrado." }); return true; }
        if (metodo === "GET") {
          res.writeHead(200, { "content-type": "application/x-tar", "content-length": fs.statSync(arquivo).size, "content-disposition": `attachment; filename="${r[1]}"`, "cache-control": "no-store" });
          fs.createReadStream(arquivo).pipe(res);
          return true;
        }
        if (metodo === "DELETE") { this.c.backups.excluir(r[1]); banco.registrar("BackupDeleted", `Backup excluído: ${r[1]}`, perfil.username); json(res, 200, { ok: true }); return true; }
      }
      if (caminho === "/api/painel/registros" && metodo === "GET") { json(res, 200, { arquivos: this.c.registros.arquivos() }); return true; }
      r = m(/^\/api\/painel\/registros\/(log_\d{8}\.log)$/);
      if (r && metodo === "GET") {
        const texto = this.c.registros.ler(r[1]);
        if (texto === null) { json(res, 404, { error: "Arquivo de registro não encontrado." }); return true; }
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        res.end(texto);
        return true;
      }
      if (caminho === "/api/painel/tarefas" && metodo === "GET") { json(res, 200, { tarefas: this.listaTarefas() }); return true; }
      r = m(/^\/api\/painel\/tarefas\/(varredura|metadados)\/executar$/);
      if (r && metodo === "POST") {
        await this.executarTarefa(r[1] as "varredura" | "metadados");
        json(res, 200, { tarefas: this.listaTarefas() });
        return true;
      }
      if (caminho === "/api/painel/bibliotecas" && metodo === "GET") { json(res, 200, { bibliotecas: this.visaoGeral().bibliotecas }); return true; }
      if (caminho === "/api/painel/bibliotecas/rastrear" && metodo === "POST") {
        await this.executarTarefa("varredura");
        json(res, 200, { bibliotecas: this.visaoGeral().bibliotecas });
        return true;
      }
      json(res, 404, { error: "Rota do Painel não encontrada." });
      return true;
    } catch (erro) {
      if (erro instanceof ErroValidacao) { json(res, 400, { error: erro.message, campo: erro.campo }); return true; }
      if (erro instanceof SyntaxError) { json(res, 400, { error: "JSON inválido." }); return true; }
      json(res, 400, { error: erro instanceof Error ? erro.message : "Erro no Painel." });
      return true;
    }
  }
}
