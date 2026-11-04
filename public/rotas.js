// Rotas do Pugoticine: cada tela tem um endereço próprio, como nos outros serviços do Pugotilab (recarregar a página,
// copiar o link ou usar Voltar/Avançar do navegador leva à mesma tela). Funções puras, testadas em test/rotas.test.mjs e test/browser-rotas.mjs.
//
//   /                                Início
//   /biblioteca/<id>?genero=&ordem=  uma biblioteca (filtros opcionais)
//   /continuar                       Continuar assistindo
//   /busca?q=<texto>                 resultados da busca
//   /titulo/<id>?temporada=<n>       detalhes de um filme ou série (janela por cima da tela anterior)
//   /assistir/<id>                   player
//   /painel, /painel/<página>        Painel do administrador
//   /salas, /salas/<id>?convite=     Salas de filme
// Endereços antigos continuam valendo: /?play=<id> (player) e /?sala=<id>&convite=<código> (convite de sala).

/** Telas que abrem por cima da tela anterior (o conteúdo de baixo continua o mesmo). */
export const SOBREPOSTAS = new Set(["titulo", "assistir", "salas"]);

const segmento = (texto) => {
  try { return decodeURIComponent(texto); } catch { return null; }
};

/**
 * Lê um endereço (string ou URL) e devolve a rota: `{ tela, ...parâmetros }`.
 * `desconhecida: true` indica um endereço que não existe (o app troca por "/").
 */
export function lerRota(endereco) {
  const url = typeof endereco === "string" ? new URL(endereco, "http://pugoticine.local") : endereco;
  const p = url.searchParams;
  const partes = url.pathname.split("/").filter(Boolean).map(segmento);
  if (partes.some((parte) => parte === null || parte === "")) return { tela: "inicio", desconhecida: true };
  const [primeira, segunda, ...resto] = partes;
  if (resto.length) return { tela: "inicio", desconhecida: true };

  if (!primeira) {
    if (p.get("play")) return { tela: "assistir", id: p.get("play"), antiga: true };
    if (p.get("sala")) {
      const rota = { tela: "salas", sala: p.get("sala"), antiga: true };
      if (p.get("convite")) rota.convite = p.get("convite");
      return rota;
    }
    return { tela: "inicio" };
  }
  if (primeira === "biblioteca" && segunda) {
    const rota = { tela: "biblioteca", biblioteca: segunda };
    if (p.get("genero")) rota.genero = p.get("genero");
    if (["recentes", "ano"].includes(p.get("ordem"))) rota.ordem = p.get("ordem");
    return rota;
  }
  if (primeira === "continuar" && !segunda) return { tela: "continuar" };
  if (primeira === "busca" && !segunda) return { tela: "busca", q: p.get("q") ?? "" };
  if (primeira === "titulo" && segunda) {
    const rota = { tela: "titulo", id: segunda };
    const temporada = Number(p.get("temporada"));
    if (p.get("temporada") && Number.isInteger(temporada) && temporada >= 0) rota.temporada = temporada;
    return rota;
  }
  if (primeira === "assistir" && segunda) return { tela: "assistir", id: segunda };
  if (primeira === "painel") return { tela: "painel", pagina: segunda ?? "painel" };
  if (primeira === "salas") {
    const rota = { tela: "salas" };
    if (segunda) rota.sala = segunda;
    if (segunda && p.get("convite")) rota.convite = p.get("convite");
    return rota;
  }
  return { tela: "inicio", desconhecida: true };
}

/** Monta o endereço (caminho + busca) de uma rota. */
export function enderecoDe(rota) {
  const id = (valor) => encodeURIComponent(String(valor));
  const busca = (pares) => {
    const p = new URLSearchParams();
    for (const [chave, valor] of pares) if (valor !== undefined && valor !== null && valor !== "") p.set(chave, String(valor));
    const texto = p.toString();
    return texto ? `?${texto}` : "";
  };
  switch (rota.tela) {
    case "biblioteca": return `/biblioteca/${id(rota.biblioteca)}${busca([["genero", rota.genero], ["ordem", rota.ordem === "titulo" ? "" : rota.ordem]])}`;
    case "continuar": return "/continuar";
    case "busca": return `/busca${busca([["q", rota.q]])}`;
    case "titulo": return `/titulo/${id(rota.id)}${busca([["temporada", rota.temporada]])}`;
    case "assistir": return `/assistir/${id(rota.id)}`;
    case "painel": return !rota.pagina || rota.pagina === "painel" ? "/painel" : `/painel/${id(rota.pagina)}`;
    case "salas": return rota.sala ? `/salas/${id(rota.sala)}${busca([["convite", rota.convite]])}` : "/salas";
    default: return "/";
  }
}

/** "view" do catálogo/Painel para uma tela de fundo (não sobreposta). */
export function viewDe(rota) {
  if (rota.tela === "biblioteca") return `biblioteca:${rota.biblioteca}`;
  if (rota.tela === "continuar") return "continue";
  if (rota.tela === "painel") return "painel";
  return "home";
}

/** Rota da tela de fundo a partir da "view" (entrada do menu lateral). */
export function rotaDaView(view) {
  if (view === "continue") return { tela: "continuar" };
  if (view === "painel") return { tela: "painel" };
  if (view.startsWith("biblioteca:")) return { tela: "biblioteca", biblioteca: view.slice("biblioteca:".length) };
  return { tela: "inicio" };
}
