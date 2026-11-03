// Rotas HTTP das salas. Tempo real com SSE (EventSource) para o servidor avisar e POST para os comandos — sem
// dependência nova (o Node já serve SSE; WebSocket exigiria biblioteca ou implementar o protocolo).
//   GET    /api/salas                    lista visível para a pessoa
//   POST   /api/salas                    cria {nome, tipo, senha?, convidados?, controle?, mediaId?}
//   GET    /api/salas/tempo              relógio do servidor (sincronização de tempo, como o TimeSync do SyncPlay)
//   GET    /api/salas/:id                detalhes (privada sem acesso = 404)
//   POST   /api/salas/:id/entrar         {senha?} ou {convite?}
//   POST   /api/salas/:id/convidar       {usuarios: []} (só o dono)
//   DELETE /api/salas/:id                exclui (dono ou admin)
//   GET    /api/salas/:id/eventos        SSE: estado da sala a cada mudança
//   POST   /api/salas/:id/comandos       {tipo: tocar|pausar|pular|filme|carregando|pronto|ping, ...}
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PugotiProfile } from "../types.js";
import { ErroSala, GerenciadorSalas, type Sala, type Usuario } from "./salas.js";

type Responder = (res: ServerResponse, status: number, corpo: unknown) => void;
type LerCorpo = <T>(req: IncomingMessage) => Promise<T>;

export class RotasSalas {
  private readonly conexoes = new Map<string, Set<{ res: ServerResponse; usuario: Usuario }>>();
  private readonly temporizador: NodeJS.Timeout;
  constructor(private readonly salas: GerenciadorSalas, private readonly existeMidia: (id: string) => boolean,
    private readonly responder: Responder, private readonly lerCorpo: LerCorpo) {
    salas.aoMudar(sala => this.transmitir(sala));
    this.temporizador = setInterval(() => salas.verificarTodas(), 500);
    this.temporizador.unref();
  }

  private transmitir(sala: Sala): void {
    for (const c of this.conexoes.get(sala.id) ?? []) {
      // Quem perdeu o acesso (sala excluída) recebe o aviso e é desconectado.
      const existe = this.salas.listar(c.usuario).some(s => s.id === sala.id);
      c.res.write(`event: ${existe ? "sala" : "encerrada"}\ndata: ${JSON.stringify(existe ? this.salas.publico(sala, c.usuario) : { id: sala.id })}\n\n`);
      if (!existe) c.res.end();
    }
  }

  /** Trata a rota se for de salas; devolve false se não for. */
  async tratar(req: IncomingMessage, res: ServerResponse, url: URL, perfil: PugotiProfile): Promise<boolean> {
    if (!url.pathname.startsWith("/api/salas")) return false;
    const usuario: Usuario = { username: perfil.username, nome: perfil.nickname || perfil.displayName || perfil.username, role: perfil.role };
    try {
      if (url.pathname === "/api/salas/tempo" && req.method === "GET") { this.responder(res, 200, { agora: Date.now() }); return true; }
      if (url.pathname === "/api/salas" && req.method === "GET") {
        this.responder(res, 200, { salas: this.salas.listar(usuario).map(s => this.salas.publico(s, usuario)) });
        return true;
      }
      if (url.pathname === "/api/salas" && req.method === "POST") {
        const dados = await this.lerCorpo<Record<string, unknown>>(req);
        if (typeof dados.mediaId === "string" && dados.mediaId && !this.existeMidia(dados.mediaId)) throw new ErroSala(400, "Filme não encontrado.");
        const sala = this.salas.criar(usuario, dados);
        this.responder(res, 201, { sala: this.salas.publico(sala, usuario) });
        return true;
      }
      const m = url.pathname.match(/^\/api\/salas\/([0-9a-f-]{36})(?:\/(entrar|convidar|eventos|comandos))?$/);
      if (!m) { this.responder(res, 404, { error: "Rota não encontrada." }); return true; }
      const [, id, acao] = m;
      if (!acao && req.method === "GET") { this.responder(res, 200, { sala: this.salas.publico(this.salas.obter(id, usuario), usuario) }); return true; }
      if (!acao && req.method === "DELETE") { this.salas.excluir(id, usuario); this.responder(res, 200, { excluida: true }); return true; }
      if (acao === "entrar" && req.method === "POST") {
        const sala = this.salas.entrar(id, usuario, await this.lerCorpo(req));
        this.responder(res, 200, { sala: this.salas.publico(sala, usuario) });
        return true;
      }
      if (acao === "convidar" && req.method === "POST") {
        const { usuarios } = await this.lerCorpo<{ usuarios?: unknown }>(req);
        this.responder(res, 200, { sala: this.salas.publico(this.salas.convidar(id, usuario, usuarios), usuario) });
        return true;
      }
      if (acao === "comandos" && req.method === "POST") {
        const comando = await this.lerCorpo<Record<string, unknown>>(req);
        if (comando.tipo === "filme" && (typeof comando.mediaId !== "string" || !this.existeMidia(comando.mediaId))) throw new ErroSala(400, "Filme não encontrado.");
        const sala = this.salas.comando(id, usuario, comando);
        this.responder(res, 200, { reproducao: sala.reproducao, agora: Date.now() });
        return true;
      }
      if (acao === "eventos" && req.method === "GET") {
        const sala = this.salas.obter(id, usuario);
        if (!this.salas.temAcesso(sala, usuario)) throw new ErroSala(403, "Entre na sala primeiro.");
        res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
        res.write("retry: 2000\n\n");
        const conexao = { res, usuario };
        const conjunto = this.conexoes.get(id) ?? new Set();
        conjunto.add(conexao);
        this.conexoes.set(id, conjunto);
        this.salas.conectar(sala, usuario);
        const batimento = setInterval(() => res.write(": ok\n\n"), 15_000);
        req.on("close", () => {
          clearInterval(batimento);
          conjunto.delete(conexao);
          this.salas.desconectar(sala, usuario);
        });
        return true;
      }
      this.responder(res, 405, { error: "Método inválido." });
    }
    catch (erro) {
      if (erro instanceof ErroSala) this.responder(res, erro.status, { error: erro.message });
      else throw erro;
    }
    return true;
  }

  parar(): void {
    clearInterval(this.temporizador);
    for (const conjunto of this.conexoes.values()) for (const c of conjunto) c.res.end();
  }
}
