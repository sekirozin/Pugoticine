import type { IncomingMessage } from "node:http";
import { config } from "./config.js";
import type { PugotiProfile } from "./types.js";

function getCookie(req: IncomingMessage, name: string): string | null {
  for (const pair of (req.headers.cookie ?? "").split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

type Buscar = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

/** O auth não respondeu (rede, demora ou erro 5xx) e não há sessão válida recente para usar no lugar. */
export class AuthIndisponivel extends Error {
  constructor() { super("A conta Pugotilab não respondeu. Tente de novo em instantes."); }
}

/**
 * Lê o perfil no Pugotilab (auth) com cache curtíssimo por sessão: cada tela, imagem e trecho de vídeo pedia o perfil
 * de novo ao auth. Usa /auth/api/session (validação leve, sem cache no auth); 3 s de cache juntam as rajadas de pedidos
 * (trechos HLS) e mantêm o "Sair" e o "Desconectar aparelho" valendo praticamente na hora. Só respostas válidas entram
 * no cache; sessão recusada é consultada de novo na próxima vez.
 *
 * Auth fora do ar ou lento (rede, tempo esgotado, 5xx) NÃO é sessão recusada: vale a última resposta válida dessa
 * sessão por até `toleranciaMs` (30 min). Antes, qualquer demora do auth (Zima sobrecarregado) virava 401 e o
 * navegador era mandado ao login no meio do filme (a página recarregava em "Carregando sua biblioteca..."). Só 401/403
 * do auth encerram a sessão. Sem resposta válida recente, lança AuthIndisponivel (o servidor responde 503, não 401).
 */
export function criarLeitorDePerfil(opcoes: { url: string; validadeMs?: number; toleranciaMs?: number; tempoLimiteMs?: number; maximo?: number; buscar?: Buscar; agora?: () => number }) {
  const validadeMs = opcoes.validadeMs ?? 3_000;
  const toleranciaMs = opcoes.toleranciaMs ?? 30 * 60_000;
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? 5_000;
  const maximo = opcoes.maximo ?? 500;
  const buscar: Buscar = opcoes.buscar ?? ((url, init) => fetch(url, init));
  const agora = opcoes.agora ?? Date.now;
  const cache = new Map<string, { perfil: PugotiProfile; expira: number; validadoEm: number }>();
  const tolerar = (guardado: { perfil: PugotiProfile; validadoEm: number } | undefined): PugotiProfile => {
    if (guardado && agora() - guardado.validadoEm <= toleranciaMs) return guardado.perfil;
    throw new AuthIndisponivel();
  };

  return async function lerPerfil(token: string): Promise<PugotiProfile | null> {
    const guardado = cache.get(token);
    if (guardado && guardado.expira > agora()) return guardado.perfil;
    let response: Awaited<ReturnType<Buscar>>;
    try {
      response = await buscar(opcoes.url, {
        headers: { Cookie: `pugotilab_session=${encodeURIComponent(token)}` }, signal: AbortSignal.timeout(tempoLimiteMs)
      });
    } catch {
      return tolerar(guardado);
    }
    if ((response.status ?? 0) >= 500) return tolerar(guardado);
    cache.delete(token);
    try {
      if (!response.ok) return null;
      const payload = await response.json() as { profile?: Partial<PugotiProfile> };
      if (!payload.profile?.username) return null;
      const perfil: PugotiProfile = {
        username: payload.profile.username.toLowerCase(),
        displayName: payload.profile.displayName || payload.profile.username,
        nickname: payload.profile.nickname || "",
        avatarUrl: payload.profile.avatarUrl || "",
        role: payload.profile.role === "admin" ? "admin" : "user"
      };
      if (cache.size >= maximo) cache.delete(cache.keys().next().value!);
      cache.set(token, { perfil, expira: agora() + validadeMs, validadoEm: agora() });
      return perfil;
    } catch {
      return null;
    }
  };
}

// /auth/api/session: só o necessário para a sessão (o /profile traz favoritos do Pugotiread e outros dados).
const urlSessao = process.env.PUGOTILAB_SESSION_URL ?? config.pugotilabProfileUrl.replace(/\/profile$/, "/session");
const lerPerfil = criarLeitorDePerfil({ url: urlSessao });

export async function getProfile(req: IncomingMessage): Promise<PugotiProfile | null> {
  const token = getCookie(req, "pugotilab_session");
  return token ? lerPerfil(token) : null;
}
