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

export async function getProfile(req: IncomingMessage): Promise<PugotiProfile | null> {
  const token = getCookie(req, "pugotilab_session");
  if (!token) return null;
  try {
    const response = await fetch(config.pugotilabProfileUrl, {
      headers: { Cookie: `pugotilab_session=${encodeURIComponent(token)}` }
    });
    if (!response.ok) return null;
    const payload = await response.json() as { profile?: Partial<PugotiProfile> };
    if (!payload.profile?.username) return null;
    return {
      username: payload.profile.username.toLowerCase(),
      displayName: payload.profile.displayName || payload.profile.username,
      nickname: payload.profile.nickname || "",
      avatarUrl: payload.profile.avatarUrl || "",
      role: payload.profile.role === "admin" ? "admin" : "user"
    };
  } catch {
    return null;
  }
}
