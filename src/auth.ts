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

type Buscar = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Lê o perfil no Pugotilab (auth) com cache curto por sessão: cada tela, imagem e trecho de vídeo pedia o perfil de
 * novo ao auth. Só respostas válidas entram no cache; sessão recusada é consultada de novo na próxima vez.
 */
export function criarLeitorDePerfil(opcoes: { url: string; validadeMs?: number; maximo?: number; buscar?: Buscar; agora?: () => number }) {
  const validadeMs = opcoes.validadeMs ?? 30_000;
  const maximo = opcoes.maximo ?? 500;
  const buscar: Buscar = opcoes.buscar ?? ((url, init) => fetch(url, init));
  const agora = opcoes.agora ?? Date.now;
  const cache = new Map<string, { perfil: PugotiProfile; expira: number }>();

  return async function lerPerfil(token: string): Promise<PugotiProfile | null> {
    const guardado = cache.get(token);
    if (guardado && guardado.expira > agora()) return guardado.perfil;
    cache.delete(token);
    try {
      const response = await buscar(opcoes.url, {
        headers: { Cookie: `pugotilab_session=${encodeURIComponent(token)}` }, signal: AbortSignal.timeout(10_000)
      });
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
      cache.set(token, { perfil, expira: agora() + validadeMs });
      return perfil;
    } catch {
      return null;
    }
  };
}

const lerPerfil = criarLeitorDePerfil({ url: config.pugotilabProfileUrl });

export async function getProfile(req: IncomingMessage): Promise<PugotiProfile | null> {
  const token = getCookie(req, "pugotilab_session");
  return token ? lerPerfil(token) : null;
}
