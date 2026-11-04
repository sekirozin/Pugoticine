// Rotas do Painel (só administrador, exceto /api/marca). Cada tela do menu do Painel do Jellyfin tem sua rota; o que
// já tem efeito no PugotiCine funciona de verdade, o resto é salvo e a tela avisa (ver efeito em configuracao.ts).
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MediaItem, PugotiProfile } from "../types.js";
import { BancoPainel } from "./banco.js";
import { GerenciadorBibliotecas, TIPOS_BIBLIOTECA, usuarioPodeVer, type Biblioteca } from "./bibliotecas.js";
import path from "node:path";
import { Backups } from "./backups.js";
import { ErroValidacao, PAGINAS, pagina, validar } from "./configuracao.js";
import { filtroDeRede } from "./redes.js";
import { disco, infoServidor, montarPainel, type RegistroAtividade } from "./painel.js";
import { Registros } from "./registros.js";
import { Agendador, DIAS, INTERVALOS_MS, descreverGatilho } from "./tarefas.js";

type Json = (res: ServerResponse, status: number, corpo: unknown) => void;
type Corpo = <T>(req: IncomingMessage) => Promise<T>;
export interface ContextoPainel {
  banco: BancoPainel; registros: Registros; backups: Backups; json: Json; corpo: Corpo;
  bibliotecas: GerenciadorBibliotecas; raizesPermitidas: string[];
  catalogo: () => MediaItem[]; ultimaVarredura: () => string; atividadeProgresso: () => RegistroAtividade[];
  varrer: () => Promise<number>; atualizarMetadados: () => Promise<void>;
  intervaloMs: number; raizMidia: string; pastaDados: string; ffmpeg: string; versao: string;
}

const CABECALHOS_CHAVE = ["x-pugoticine-token", "x-emby-token", "x-mediabrowser-token"];

export class RotasPainel {
  private readonly ultimosRegistros = new Map<string, number>();
  readonly agendador: Agendador;
  constructor(private readonly c: ContextoPainel) {
    // Tarefas do Jellyfin que existem no PugotiCine (nomes e categorias do Localization/Core/pt-BR.json).
    this.agendador = new Agendador(c.banco.db, (t, ok, mensagem) => c.banco.registrar(ok ? "TaskCompleted" : "TaskFailed", `${t.nome} ${ok ? "concluída" : "falhou"}`, null, mensagem ?? "", ok ? "Information" : "Error"));
    const intervalo = { tipo: "intervalo" as const, intervaloMs: c.intervaloMs };
    this.agendador.registrar({ id: "varredura", nome: "Escanear a Biblioteca de Mídia", categoria: "Biblioteca", descricao: "Escaneie a sua biblioteca de mídia para arquivos novos e atualize os metadados.",
      gatilhosPadrao: [intervalo], executar: async () => `${await c.varrer()} item(ns) no catálogo` });
    this.agendador.registrar({ id: "metadados", nome: "Atualizar metadados do Radarr", categoria: "Biblioteca", descricao: "Busca sinopse, pôster, notas e classificação dos filmes no Radarr.",
      gatilhosPadrao: [intervalo], executar: async () => { await c.atualizarMetadados(); } });
    this.agendador.registrar({ id: "limpar-atividade", nome: "Limpar Registro de Atividades", categoria: "Manutenção", descricao: "Apaga o registro de atividades mais antigo que a idade configurada (30 dias).",
      gatilhosPadrao: [{ tipo: "intervalo", intervaloMs: 24 * 3_600_000 }], executar: async () => `${c.banco.limparAtividade(30)} evento(s) apagado(s)` });
    this.agendador.registrar({ id: "limpar-registros", nome: "Limpar pasta de logs", categoria: "Manutenção", descricao: "Deletar arquivos de registro com mais de 7 dias.",
      gatilhosPadrao: [{ tipo: "intervalo", intervaloMs: 24 * 3_600_000 }], executar: async () => `${c.registros.limpar()} arquivo(s) apagado(s)` });
    this.agendador.registrar({ id: "limpar-temporarios", nome: "Limpar Arquivos Temporários", categoria: "Manutenção", descricao: "Deletar arquivos temporários que não são mais necessários para o sistema.",
      gatilhosPadrao: [{ tipo: "intervalo", intervaloMs: 24 * 3_600_000 }], executar: async () => `${limparTemporarios(c.backups.pasta)} item(ns) apagado(s)` });
    this.agendador.registrar({ id: "otimizar-banco", nome: "Otimizar base de dados", categoria: "Manutenção", descricao: "Compactar base de dados e liberar espaço livre.",
      gatilhosPadrao: [{ tipo: "intervalo", intervaloMs: 6 * 3_600_000 }], executar: async () => {
        const antes = fs.statSync(c.banco.arquivo).size;
        c.banco.db.exec("PRAGMA optimize; VACUUM;");
        return `painel.db: ${Math.round(antes / 1024)} KB → ${Math.round(fs.statSync(c.banco.arquivo).size / 1024)} KB`;
      } });
  }

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

  /** Usuários › Acesso à biblioteca e Controle dos pais: administrador vê tudo. */
  /** Painel › Redes: decide se a conexão pode entrar (chamado antes de qualquer rota, até dos arquivos estáticos). */
  private filtroRede: ReturnType<typeof filtroDeRede> | null = null;
  acessoDeRede(req: IncomingMessage) {
    this.filtroRede ??= filtroDeRede(this.c.banco.ler("redes"));
    return this.filtroRede(req.socket.remoteAddress ?? "", req.headers["x-forwarded-for"]);
  }

  /** Bibliotecas que aparecem para a pessoa (menu lateral e Início), pelo acesso do Painel › Usuários. */
  podeVerBiblioteca(perfil: PugotiProfile, id: string): boolean {
    if (perfil.role === "admin") return true;
    const u = this.c.banco.usuario(perfil.username);
    return !u || u.todasBibliotecas || u.bibliotecas.includes(id);
  }

  podeVer(perfil: PugotiProfile, item: MediaItem): boolean {
    if (perfil.role === "admin") return true;
    return usuarioPodeVer(this.c.banco.usuario(perfil.username), item as MediaItem & { bibliotecaId?: string });
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

  /** Mantido para quem chamava a tarefa direto (varredura da biblioteca e metadados). */
  async executarTarefa(id: string) { return this.agendador.executar(id); }
  iniciarAgendador(): void { this.agendador.iniciar(); }
  pararAgendador(): void { this.agendador.parar(); }

  private visaoGeral() {
    const geral = this.c.banco.ler("geral");
    const servidor = { ...infoServidor(this.c.versao, this.c.ffmpeg), nome: String(geral.ServerName) };
    const visao = montarPainel({ catalogo: this.c.catalogo(), ultimaVarredura: this.c.ultimaVarredura(), intervaloVarreduraMs: this.c.intervaloMs,
      raizMidia: this.c.raizMidia, atividade: this.c.atividadeProgresso(), agora: new Date(), servidor,
      discos: [disco(this.c.raizMidia, "Mídia"), disco(this.c.pastaDados, "Dados do PugotiCine")] });
    const tipos = Object.fromEntries(TIPOS_BIBLIOTECA.map(x => [x.valor, x.rotulo]));
    visao.bibliotecas = this.c.bibliotecas.bibliotecas().map(b => ({ nome: b.nome, tipo: tipos[b.tipo], caminho: b.pastas.join(", "), itens: b.itens,
      ultimaVarredura: b.ultimaVarredura, proximaVarredura: visao.bibliotecas[0]?.proximaVarredura ?? null }));
    return visao;
  }

  private listaTarefas() {
    return this.agendador.lista().map(t => ({ ...t, gatilhosTexto: t.gatilhos.map(descreverGatilho) }));
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
          const entrada = await this.c.corpo<Record<string, unknown>>(req);
          if (p.id === "redes") {
            const depois = filtroDeRede(validar(p, entrada, banco.ler(p.id)))(req.socket.remoteAddress ?? "", req.headers["x-forwarded-for"]);
            if (!depois.permitido) { json(res, 400, { error: `Esta configuração bloquearia o seu próprio acesso (${depois.ip}: ${depois.motivo}).` }); return true; }
          }
          const valores = banco.salvar(p.id, entrada);
          if (p.id === "redes") this.filtroRede = null;
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
      if (caminho === "/api/painel/backups" && metodo === "GET") { json(res, 200, { backups: this.c.backups.listar(), restauracaoPendente: this.c.backups.restauracaoPendente() }); return true; }
      if (caminho === "/api/painel/backups/restauracao" && metodo === "DELETE") {
        if (this.c.backups.cancelarRestauracao()) banco.registrar("BackupRestoreCanceled", "Restauração de backup cancelada", perfil.username);
        json(res, 200, { restauracaoPendente: null });
        return true;
      }
      if (caminho === "/api/painel/backups" && metodo === "POST") {
        const backup = await this.c.backups.criar();
        banco.registrar("BackupCreated", `Backup criado: ${backup.nome}`, perfil.username);
        json(res, 201, { backup });
        return true;
      }
      r = m(/^\/api\/painel\/backups\/(pugoticine-backup-\d{14}\.tar)(\/restaurar)?$/);
      if (r) {
        if (r[2] && metodo === "POST") {
          const { confirmar } = await this.c.corpo<{ confirmar?: string }>(req).catch(() => ({ confirmar: undefined }));
          if (confirmar !== r[1]) { json(res, 400, { error: "Confirme a restauração digitando o nome do backup." }); return true; }
          const pedido = await this.c.backups.agendarRestauracao(r[1]);
          banco.registrar("BackupRestoreScheduled", `Restauração agendada: ${r[1]}`, perfil.username, `Backup de segurança: ${pedido.seguranca}. Será aplicada ao reiniciar o PugotiCine.`, "Warning");
          json(res, 200, { restauracaoPendente: pedido });
          return true;
        }
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
      if (caminho === "/api/painel/tarefas" && metodo === "GET") { json(res, 200, { tarefas: this.listaTarefas(), intervalos: INTERVALOS_MS, dias: DIAS }); return true; }
      r = m(/^\/api\/painel\/tarefas\/([a-z-]{3,40})(\/executar|\/gatilhos)?$/);
      if (r) {
        if (r[2] === "/executar" && metodo === "POST") { await this.agendador.executar(r[1]); json(res, 200, { tarefas: this.listaTarefas() }); return true; }
        if (r[2] === "/gatilhos" && metodo === "PUT") {
          const { gatilhos } = await this.c.corpo<{ gatilhos?: unknown }>(req);
          this.agendador.definirGatilhos(r[1], gatilhos);
          banco.registrar("TaskTriggersUpdated", `Disparadores de tarefa alterados: ${this.agendador.estado(r[1]).nome}`, perfil.username);
          json(res, 200, { tarefa: { ...this.agendador.estado(r[1]), gatilhosTexto: this.agendador.gatilhos(r[1]).map(descreverGatilho) } });
          return true;
        }
        if (!r[2] && metodo === "GET") { json(res, 200, { tarefa: this.listaTarefas().find(t => t.id === r![1]) ?? null, intervalos: INTERVALOS_MS, dias: DIAS }); return true; }
      }
      // ---------- Bibliotecas (LibraryStructureController) ----------
      const listaBibliotecas = () => ({ bibliotecas: this.c.bibliotecas.bibliotecas(), tipos: TIPOS_BIBLIOTECA, raizesPermitidas: this.c.raizesPermitidas });
      if (caminho === "/api/painel/bibliotecas" && metodo === "GET") { json(res, 200, listaBibliotecas()); return true; }
      if (caminho === "/api/painel/bibliotecas" && metodo === "POST") {
        const b = this.c.bibliotecas.criar(await this.c.corpo<Partial<Biblioteca>>(req));
        banco.registrar("LibraryCreated", `Biblioteca ${b.nome} adicionada`, perfil.username, b.pastas.join(", "));
        json(res, 201, { biblioteca: b, ...listaBibliotecas() });
        return true;
      }
      if (caminho === "/api/painel/bibliotecas/rastrear" && metodo === "POST") {
        await this.executarTarefa("varredura");
        json(res, 200, listaBibliotecas());
        return true;
      }
      r = m(/^\/api\/painel\/bibliotecas\/([a-z0-9-]{1,40})(\/rastrear)?$/);
      if (r) {
        const id = r[1];
        if (r[2] && metodo === "POST") {
          const n = this.c.bibliotecas.varrer(id);
          banco.registrar("LibraryScanned", `Biblioteca ${this.c.bibliotecas.biblioteca(id)?.nome} rastreada: ${n} item(ns)`, perfil.username);
          json(res, 200, listaBibliotecas());
          return true;
        }
        if (metodo === "PUT") {
          const b = this.c.bibliotecas.atualizar(id, await this.c.corpo<Partial<Biblioteca>>(req));
          banco.registrar("LibraryUpdated", `Biblioteca ${b.nome} alterada`, perfil.username);
          json(res, 200, { biblioteca: b, ...listaBibliotecas() });
          return true;
        }
        if (metodo === "DELETE") {
          const nome = this.c.bibliotecas.biblioteca(id)?.nome;
          this.c.bibliotecas.remover(id);
          banco.registrar("LibraryDeleted", `Biblioteca ${nome} removida (os arquivos não foram apagados)`, perfil.username);
          json(res, 200, listaBibliotecas());
          return true;
        }
      }
      // Seletor de pastas (o "Selecionar Diretório" do Jellyfin), só dentro das pastas de mídia permitidas.
      if (caminho === "/api/painel/pastas" && metodo === "GET") {
        const pedido = url.searchParams.get("caminho");
        if (!pedido) { json(res, 200, { caminho: null, pai: null, pastas: this.c.raizesPermitidas.filter(r => fs.existsSync(r)) }); return true; }
        const alvo = path.resolve(pedido);
        if (!this.c.raizesPermitidas.some(raiz => alvo === raiz || alvo.startsWith(raiz + path.sep))) { json(res, 400, { error: "Fora das pastas de mídia permitidas." }); return true; }
        let pastas: string[];
        try { pastas = fs.readdirSync(alvo, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith(".")).map(e => path.join(alvo, e.name)).sort((a, b) => a.localeCompare(b, "pt-BR")); }
        catch { json(res, 404, { error: "Pasta não encontrada." }); return true; }
        const pai = this.c.raizesPermitidas.includes(alvo) ? null : path.dirname(alvo);
        json(res, 200, { caminho: alvo, pai, pastas });
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

/** "Limpar Arquivos Temporários": sobras de backups interrompidos (.novo-*) e arquivos .tmp com mais de 1 hora. */
export function limparTemporarios(pasta: string): number {
  let n = 0;
  if (!fs.existsSync(pasta)) return 0;
  for (const nome of fs.readdirSync(pasta)) {
    const alvo = path.join(pasta, nome);
    if ((nome.startsWith(".novo-") || nome.endsWith(".tmp")) && Date.now() - fs.statSync(alvo).mtimeMs > 3_600_000) { fs.rmSync(alvo, { recursive: true, force: true }); n++; }
  }
  return n;
}
