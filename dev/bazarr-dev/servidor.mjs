// Bazarr de desenvolvimento: responde o histórico (/api/movies|episodes/history) no formato do Bazarr 1.6, para o
// Pugoticine rotular "Bazarr - PT-BR" no notebook. NÃO usar em produção. Caminhos como o Bazarr do Zima vê (/jellyfin).
import http from "node:http";
const HISTORICO = {
  movies: [{ action: 1, provider: "opensubtitlescom", language: { code2: "pb" },
    subtitles_path: "/jellyfin/The Godfather (1972)/The Godfather (1972) Dual Audio.pt-BR.srt" }],
  episodes: []
};
http.createServer((req, res) => {
  const tipo = new URL(req.url, "http://bazarr-dev").pathname.match(/^\/api\/(movies|episodes)\/history$/)?.[1];
  if (req.headers["x-api-key"] !== "bazarr-dev") { res.writeHead(401); return res.end(); }
  res.writeHead(tipo ? 200 : 404, { "Content-Type": "application/json" });
  res.end(JSON.stringify(tipo ? { data: HISTORICO[tipo], total: HISTORICO[tipo].length } : {}));
}).listen(8080);
