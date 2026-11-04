// Gera public/icones.js e preenche os <svg data-icone="..."> do index.html a partir do pacote oficial do Tabler Icons
// (https://tabler.io/icons, licença MIT) — regra dos projetos Pugoti: todos os ícones vêm do Tabler.
// Uso: node ferramentas/gerar-icones.mjs [pasta do pacote @tabler/icons]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pacote = process.argv[2] ?? "/home/sekironote/IA/Ferramentas/tabler-icons/node_modules/@tabler/icons";
const versao = JSON.parse(fs.readFileSync(path.join(pacote, "package.json"), "utf8")).version;

// Nome no app → arquivo do Tabler ("-cheio" = variante preenchida).
const USADOS = [
  "menu-2", "search", "home", "movie", "device-tv", "device-tv-old", "folder", "layout-dashboard", "clock-play", "refresh", "logout",
  "arrow-left", "rewind-backward-10", "rewind-forward-30", "badge-cc", "music", "volume", "volume-off", "settings", "picture-in-picture",
  "maximize", "minimize", "info-circle", "x", "chevron-left", "chevron-right", "users-group", "users", "books", "player-play", "devices",
  "activity", "plug", "world", "key", "database-export", "file-text", "list-check", "player-record",
  "circle-check", "player-play-cheio", "player-pause-cheio", "circle-check-cheio"
];
function conteudo(nome) {
  const cheio = nome.endsWith("-cheio");
  const arquivo = path.join(pacote, "icons", cheio ? "filled" : "outline", `${nome.replace(/-cheio$/, "")}.svg`);
  const svg = fs.readFileSync(arquivo, "utf8");
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, "").replace(/\s+/g, " ").replace(/> </g, "><").trim();
}
const icones = Object.fromEntries(USADOS.map((n) => [n, conteudo(n)]));

const js = `// GERADO por ferramentas/gerar-icones.mjs a partir do Tabler Icons ${versao} (https://tabler.io/icons, MIT).
// Não editar à mão: acrescente o nome em USADOS no gerador e rode de novo.
export const ICONES = ${JSON.stringify(icones, null, 1)};
/** SVG de um ícone do Tabler; "-cheio" usa a variante preenchida. */
export function icone(nome, classe = "") {
  const cheio = nome.endsWith("-cheio");
  return \`<svg class="\${cheio ? "icone-tabler-cheio" : "icone-tabler"}\${classe ? " " + classe : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">\${ICONES[nome] ?? ICONES["x"]}</svg>\`;
}
/** Conteúdo interno (para trocar o ícone de um <svg> existente sem recriá-lo). */
export const conteudoIcone = (nome) => ICONES[nome] ?? "";
// Scripts clássicos (salas.js) usam por aqui.
if (typeof window !== "undefined") window.pugoticineIcones = { icone, conteudoIcone, ICONES };
`;
fs.writeFileSync(path.join(raiz, "public", "icones.js"), js);

// index.html: <svg data-icone="nome" ...>…</svg> recebe o desenho do Tabler (estático, sem piscar ao carregar).
const html = path.join(raiz, "public", "index.html");
let pagina = fs.readFileSync(html, "utf8"), trocados = 0;
pagina = pagina.replace(/<svg([^>]*?)data-icone="([^"]+)"([^>]*)>[\s\S]*?<\/svg>/g, (_t, antes, nome, depois) => {
  if (!icones[nome]) throw new Error(`Ícone "${nome}" do index.html não está em USADOS.`);
  const attrs = `${antes}data-icone="${nome}"${depois}`.replace(/\s*class="([^"]*)"/, (_m, c) => ` class="${c.replace(/\bicone-tabler(-cheio)?\b\s*/g, "").trim()}"`);
  const base = nome.endsWith("-cheio") ? "icone-tabler-cheio" : "icone-tabler";
  const comClasse = /class="/.test(attrs) ? attrs.replace(/class="/, `class="${base} `).replace(/ "/, '"') : `${attrs} class="${base}"`;
  trocados++;
  return `<svg${comClasse.replace(/\s+viewBox="[^"]*"/, "")} viewBox="0 0 24 24" aria-hidden="true">${icones[nome]}</svg>`;
});
fs.writeFileSync(html, pagina);
console.log(`Tabler ${versao}: ${USADOS.length} ícones em public/icones.js; ${trocados} ícone(s) do index.html atualizados.`);
