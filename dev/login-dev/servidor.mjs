// Login de desenvolvimento: faz o papel do Pugotilab só no notebook, porque o cookie real (pugotilab.com) não chega ao
// localhost. NÃO usar em produção. Página /auth escolhe o usuário e grava o cookie pugotilab_session; /auth/api/profile
// responde no formato do Pugotilab (o mesmo que src/auth.ts lê).
import http from "node:http";
const USUARIOS = {
  sekiro: { username: "sekiro", displayName: "sekiro", role: "admin" },
  marcos: { username: "marcos", displayName: "marcos", role: "user" },
  mael: { username: "mael", displayName: "mael", role: "user" },
  ivis: { username: "ivis", displayName: "ivis", role: "user" },
  // Nunca usou o Pugoticine: só aparece pela busca do Pugotilab (salas, PQA-290).
  lia: { username: "lia", displayName: "Lia Campos", role: "user" }
};
// Amigos (como /auth/api/friends do Pugotilab): quem cada um segue.
const AMIGOS = { sekiro: ["marcos", "mael"], marcos: ["sekiro"] };
const publico = (u, seguido) => ({ id: u.username, username: u.username, displayName: u.displayName, nickname: "", avatarUrl: "", followed: seguido });
const cookie = (req, nome) => (req.headers.cookie ?? "").split(";").map(p => p.trim().split("=")).find(([k]) => k === nome)?.[1];
const escapar = (t) => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
http.createServer((req, res) => {
  const url = new URL(req.url, "http://login-dev");
  if (url.pathname === "/auth/api/profile" || url.pathname === "/auth/api/session") {
    const usuario = USUARIOS[decodeURIComponent(cookie(req, "pugotilab_session") ?? "").replace(/^dev-/, "")];
    res.writeHead(usuario ? 200 : 401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(usuario ? { profile: usuario } : { error: "Sem sessão." }));
  }
  if (url.pathname === "/auth/api/friends" || url.pathname === "/auth/api/friends/search") {
    const eu = USUARIOS[decodeURIComponent(cookie(req, "pugotilab_session") ?? "").replace(/^dev-/, "")];
    if (!eu) { res.writeHead(401, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ authenticated: false })); }
    const amigos = AMIGOS[eu.username] ?? [];
    res.writeHead(200, { "Content-Type": "application/json" });
    if (url.pathname === "/auth/api/friends") return res.end(JSON.stringify({ friends: amigos.map((n) => publico(USUARIOS[n], true)) }));
    const q = (url.searchParams.get("q") ?? "").toLowerCase().replace(/^@/, "");
    const achados = Object.values(USUARIOS).filter((u) => u.username !== eu.username && q && `${u.username} ${u.displayName}`.toLowerCase().includes(q));
    return res.end(JSON.stringify({ users: achados.map((u) => publico(u, amigos.includes(u.username))) }));
  }
  if (url.pathname === "/auth/entrar") {
    const usuario = url.searchParams.get("usuario");
    const volta = url.searchParams.get("return") || "http://127.0.0.1:3012/";
    if (!USUARIOS[usuario]) { res.writeHead(400); return res.end("Usuário inválido."); }
    // Cookie por host (127.0.0.1), vale para qualquer porta: o Pugoticine em :3012 recebe.
    res.writeHead(302, { "Set-Cookie": `pugotilab_session=dev-${usuario}; Path=/; HttpOnly; SameSite=Lax`, Location: volta });
    return res.end();
  }
  if (url.pathname === "/auth/sair") {
    res.writeHead(302, { "Set-Cookie": "pugotilab_session=; Path=/; Max-Age=0", Location: url.searchParams.get("return") || "http://127.0.0.1:3012/" });
    return res.end();
  }
  if (url.pathname === "/auth") {
    const volta = url.searchParams.get("return") || "http://127.0.0.1:3012/";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Login de desenvolvimento</title>
<body style="font-family:system-ui;background:#111;color:#eee;display:grid;place-content:center;min-height:100vh;gap:12px;text-align:center">
<h1 style="margin:0">Pugotilab · login de desenvolvimento</h1><p style="color:#aaa;margin:0">Só para testar o Pugoticine no notebook.</p>
${Object.values(USUARIOS).map(u => `<a style="padding:12px 20px;border-radius:10px;background:#d97706;color:#fff;text-decoration:none;font-weight:700" href="/auth/entrar?usuario=${u.username}&return=${encodeURIComponent(volta)}">Entrar como ${escapar(u.displayName)} (${u.role})</a>`).join("")}
</body>`);
  }
  res.writeHead(404); res.end();
}).listen(8080);
