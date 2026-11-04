// Regras de nomes de arquivos do Jellyfin 10.11.10 (Emby.Naming), portadas para o Pugoticine.
// Fonte: motor/servidor/Emby.Naming (EpisodePathParser, EpisodeResolver, SeasonPathParser, SeriesResolver,
// SeriesPathParser, VideoResolver, CleanStringParser, CleanDateTimeParser, ExtraRuleResolver, StubResolver).
// Os dados (expressões, extensões, regras) vêm de opcoes-jellyfin.ts, exportados do próprio binário pelo oráculo, e o
// resultado é conferido caso a caso contra o oráculo (test/fixtures/oraculo-jellyfin-10.11.10.jsonl).
import { OPCOES_JELLYFIN as O, type ExpressaoJellyfin } from "./opcoes-jellyfin.js";
import { converterRegexNet, grupoNet, type RegexNet } from "./regex-dotnet.js";

// ---------- utilidades com a semântica do .NET ----------
/** Path.GetFileName */
export function nomeDoArquivo(caminho: string): string {
  return caminho.slice(caminho.lastIndexOf("/") + 1);
}
/** Path.GetDirectoryName (caminhos com "/") */
export function pastaDe(caminho: string): string {
  const i = caminho.lastIndexOf("/");
  return i <= 0 ? (i === 0 ? "/" : "") : caminho.slice(0, i);
}
/** Path.GetExtension: inclui o ponto; vazio sem extensão. */
export function extensaoDe(caminho: string): string {
  const nome = nomeDoArquivo(caminho);
  const i = nome.lastIndexOf(".");
  return i < 0 || i === nome.length - 1 ? "" : nome.slice(i);
}
/** Path.GetFileNameWithoutExtension */
export function nomeSemExtensao(caminho: string): string {
  const nome = nomeDoArquivo(caminho);
  const i = nome.lastIndexOf(".");
  return i < 0 ? nome : nome.slice(0, i);
}
/** int.TryParse(..., NumberStyles.Integer, InvariantCulture) */
function inteiro(valor: string | undefined): number | null {
  if (valor === undefined || !/^\s*[+-]?[0-9]+\s*$/.test(valor)) return null;
  const numero = Number(valor.trim());
  return numero > 2147483647 || numero < -2147483648 ? null : numero;
}
/** string.Trim(caracteres) */
function aparar(texto: string, caracteres: string): string {
  let inicio = 0, fim = texto.length;
  while (inicio < fim && caracteres.includes(texto[inicio])) inicio++;
  while (fim > inicio && caracteres.includes(texto[fim - 1])) fim--;
  return texto.slice(inicio, fim);
}
const contemSemCaixa = (lista: readonly string[], valor: string) => lista.some(item => item.toLowerCase() === valor.toLowerCase());

// ---------- expressões compiladas ----------
interface Expressao extends RegexNet {
  isByDate: boolean; isOptimistic: boolean; isNamed: boolean; supportsAbsolute: boolean; formatosData: readonly string[];
}
const compilarExpressao = (e: ExpressaoJellyfin): Expressao => ({
  ...converterRegexNet(e.Expression),
  isByDate: e.IsByDate, isOptimistic: e.IsOptimistic, isNamed: e.IsNamed,
  supportsAbsolute: e.SupportsAbsoluteEpisodeNumbers, formatosData: e.DateTimeFormats
});
const EXPRESSOES_EPISODIO = O.EpisodeExpressions.map(compilarExpressao);
const EXPRESSOES_MULTIPLAS = O.MultipleEpisodeExpressions.map(compilarExpressao);
const LIMPAR_DATA = O.CleanDateTimes.map(e => converterRegexNet(e));
const LIMPAR_NOME = O.CleanStrings.map(e => converterRegexNet(e));

// ---------- EpisodePathParser ----------
export interface ResultadoEpisodio {
  sucesso: boolean; serie: string | null; temporada: number | null; episodio: number | null; episodioFinal: number | null;
  porData: boolean; ano: number | null; mes: number | null; dia: number | null;
}
const vazio = (): ResultadoEpisodio => ({ sucesso: false, serie: null, temporada: null, episodio: null, episodioFinal: null, porData: false, ano: null, mes: null, dia: null });

/** DateTime.TryParseExact com os formatos do Jellyfin (yyyy, MM, dd e separadores literais). */
function dataExata(texto: string, formatos: readonly string[]): { ano: number; mes: number; dia: number } | null {
  for (const formato of formatos) {
    if (formato.length !== texto.length) continue;
    let ano = "", mes = "", dia = "", ok = true;
    for (let i = 0; i < formato.length && ok; i++) {
      const f = formato[i], c = texto[i];
      if (f === "y") { if (!/[0-9]/.test(c)) ok = false; else ano += c; }
      else if (f === "M") { if (!/[0-9]/.test(c)) ok = false; else mes += c; }
      else if (f === "d") { if (!/[0-9]/.test(c)) ok = false; else dia += c; }
      else if (f !== c) ok = false;
    }
    if (!ok) continue;
    const a = Number(ano), m = Number(mes), d = Number(dia);
    const data = new Date(Date.UTC(a, m - 1, d));
    if (a >= 1 && m >= 1 && m <= 12 && data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d)
      return { ano: a, mes: m, dia: d };
  }
  return null;
}

function parseComExpressao(nomeOriginal: string, expressao: Expressao): ResultadoEpisodio {
  const resultado = vazio();
  const nome = expressao.isByDate ? nomeOriginal.replaceAll("_", "-") : nomeOriginal;
  const m = expressao.regex.exec(nome);
  if (!m || m.length < 3) return resultado;
  if (expressao.isByDate) {
    const data = expressao.formatosData.length > 0 ? dataExata(m[0], expressao.formatosData) : null;
    if (data) Object.assign(resultado, data);
    resultado.sucesso = true; // como no Jellyfin: sucesso mesmo se a data não for válida (TODO deles)
  }
  else if (expressao.isNamed) {
    const g = m.groups ?? {};
    resultado.temporada = inteiro(g.seasonnumber);
    resultado.episodio = inteiro(g.epnumber);
    if (g.endingepnumber !== undefined) {
      // Só vale se não vier seguido de dígito, "p" ou "i" (resolução, ex.: "s09e14-1080p").
      const indice = m.indices?.groups?.endingepnumber;
      const proximo = indice ? indice[1] : nome.length;
      if (proximo >= nome.length || !"0123456789iIpP".includes(nome[proximo]))
        resultado.episodioFinal = inteiro(g.endingepnumber);
    }
    resultado.serie = g.seriesname ?? "";
    resultado.sucesso = resultado.episodio !== null;
  }
  else {
    resultado.temporada = inteiro(grupoNet(m, expressao.mapaGrupos, 1));
    resultado.episodio = inteiro(grupoNet(m, expressao.mapaGrupos, 2));
    resultado.sucesso = resultado.episodio !== null;
  }
  // Temporada 200–1927 ou acima de 2500 é erro de leitura (ex.: "1920x1080").
  if (resultado.temporada !== null && ((resultado.temporada >= 200 && resultado.temporada < 1928) || resultado.temporada > 2500))
    resultado.sucesso = false;
  resultado.porData = expressao.isByDate;
  return resultado;
}

function completar(caminho: string, info: ResultadoEpisodio): void {
  const expressoes = EXPRESSOES_MULTIPLAS.filter(e => e.isNamed);
  if (!info.serie) expressoes.unshift(...EXPRESSOES_EPISODIO.filter(e => e.isNamed));
  for (const expressao of expressoes) {
    const r = parseComExpressao(caminho, expressao);
    if (!r.sucesso) continue;
    if (!info.serie) info.serie = r.serie;
    if (info.episodioFinal === null && info.episodio !== null) info.episodioFinal = r.episodioFinal;
    if (info.serie && (info.episodio === null || info.episodioFinal !== null)) break;
  }
}

export function parseEpisodio(caminho: string, ehPasta: boolean, isNamed?: boolean, isOptimistic?: boolean, supportsAbsolute?: boolean, completarInfo = true): ResultadoEpisodio {
  if (ehPasta) caminho += ".mp4";
  let resultado: ResultadoEpisodio | null = null;
  for (const expressao of EXPRESSOES_EPISODIO) {
    if (supportsAbsolute !== undefined && expressao.supportsAbsolute !== supportsAbsolute) continue;
    if (isNamed !== undefined && expressao.isNamed !== isNamed) continue;
    if (isOptimistic !== undefined && expressao.isOptimistic !== isOptimistic) continue;
    const atual = parseComExpressao(caminho, expressao);
    if (atual.sucesso) { resultado = atual; break; }
  }
  if (resultado && completarInfo) {
    completar(caminho, resultado);
    if (resultado.serie) resultado.serie = aparar(resultado.serie.trim(), "_.-").trim(); // .Trim().Trim('_', '.', '-').Trim()
  }
  return resultado ?? vazio();
}

// ---------- StubResolver / VideoResolver.IsVideoFile ----------
export const ehArquivoDeVideo = (caminho: string) => contemSemCaixa(O.VideoFileExtensions, extensaoDe(caminho));
export const ehArquivoDeAudio = (caminho: string) => contemSemCaixa(O.AudioFileExtensions, extensaoDe(caminho));
export const ehLegenda = (caminho: string) => contemSemCaixa(O.SubtitleFileExtensions, extensaoDe(caminho));
function stub(caminho: string): { ehStub: boolean; tipo: string | null } {
  if (!contemSemCaixa(O.StubFileExtensions, extensaoDe(caminho))) return { ehStub: false, tipo: null };
  const token = extensaoDe(nomeSemExtensao(caminho)).replace(/^\.+/, "").toLowerCase();
  return { ehStub: true, tipo: O.StubTypes.find(r => r.Token.toLowerCase() === token)?.StubType ?? null };
}

// ---------- EpisodeResolver ----------
export interface InfoEpisodio extends ResultadoEpisodio { container: string | null; ehStub: boolean }
export function resolverEpisodio(caminho: string, ehPasta: boolean, isNamed?: boolean, isOptimistic?: boolean, supportsAbsolute?: boolean): InfoEpisodio | null {
  let container: string | null = null, ehStub = false;
  if (!ehPasta) {
    const extensao = extensaoDe(caminho);
    if (!contemSemCaixa(O.VideoFileExtensions, extensao)) {
      if (!stub(caminho).ehStub) return null;
      ehStub = true;
    }
    container = extensao.replace(/^\.+/, "");
  }
  const r = parseEpisodio(caminho, ehPasta, isNamed, isOptimistic, supportsAbsolute);
  if (!r.sucesso && !ehStub) return null;
  return { ...r, container, ehStub };
}

// ---------- SeasonPathParser ----------
const PREFIXOS_TEMPORADA = String.raw`(?:[\[시즌]*|[シーズン]*|[sS](?:eason|æson|aison|taffel|eries|tagione|äsong|eizoen|easong|ezon|ezona|ezóna|ezonul)*|[tT](?:emporada)*|[kK](?:ausi)*|[Сс](?:езон)*)`;
// "(?<seasonnumber>(?>\d+))" do .NET: grupo atômico emulado com lookahead + referência (mesmo efeito: sem retrocesso).
const PROCESSO_PRE = new RegExp(String.raw`^\s*((?=(?<atomo>\p{Nd}+))(?<seasonnumber>\k<atomo>)(?:st|nd|rd|th|\.)*(?!\s*[Ee]\p{Nd}+))\s*${PREFIXOS_TEMPORADA}\s*(?<rightpart>.*)$`, "iu");
const PROCESSO_POS = new RegExp(String.raw`^\s*${PREFIXOS_TEMPORADA}\s*(?<seasonnumber>\p{Nd}+?)(?=\p{Nd}{3,4}p|[^\p{Nd}]|$)(?!\s*[Ee]\p{Nd})(?<rightpart>.*)$`, "iu");
const PREFIXO_TEMPORADA = /[sS](\p{Nd}{1,4})(?!\p{Nd}|[eE]\p{Nd})(?=\.|_|-|\[|\]|\s|$)/u;
const LIMPAR_NOME_PASTA = /[ ._\-\[\]]/g;

export function temporadaDaPasta(caminho: string, pastaPai: string | null, aliasesEspeciais: boolean, pastasNumericas: boolean): number | null {
  const nomePai = pastaPai === null ? null : nomeDoArquivo(pastaPai.replace(/\/+$/, ""));
  const nome = nomeDoArquivo(caminho);
  const prefixo = PREFIXO_TEMPORADA.exec(nome);
  if (prefixo) { const n = inteiro(prefixo[1]); if (n !== null) return n; }
  let limpo = nome.replace(LIMPAR_NOME_PASTA, "");
  if (nomePai !== null) {
    const pai = nomePai.replace(LIMPAR_NOME_PASTA, "");
    if (pai) limpo = limpo.replace(new RegExp(pai.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), "");
  }
  if (aliasesEspeciais && (limpo.toLowerCase() === "specials" || limpo.toLowerCase() === "extras")) return 0;
  if (pastasNumericas) { const n = inteiro(limpo); if (n !== null) return n; }
  const pre = PROCESSO_PRE.exec(limpo);
  const m = pre ?? PROCESSO_POS.exec(limpo);
  return m?.groups?.seasonnumber !== undefined ? inteiro(m.groups.seasonnumber) : null;
}

// ---------- SeriesResolver / SeriesPathParser ----------
const NOME_SERIE = /((?<a>[^\._]{2,})[\._]*)|([\._](?<b>[^\._]{2,}))/gu;
export function nomeDaSerie(caminhoDaPasta: string): string {
  let nome = nomeDoArquivo(caminhoDaPasta);
  for (const expressao of EXPRESSOES_EPISODIO) {
    const m = expressao.regex.exec(caminhoDaPasta);
    if (!m || m.length < 3 || !expressao.isNamed) continue;
    const serie = m.groups?.seriesname ?? "";
    if (serie && (m.groups?.seasonnumber ?? "") !== "") {
      nome = aparar(serie, " _.-");
      break;
    }
  }
  return nome ? nome.replace(NOME_SERIE, (_t, _1, a, _3, b) => `${a ?? ""} ${b ?? ""}`).trim() : nome;
}

// ---------- CleanDateTimeParser / CleanStringParser ----------
export function limparDataHora(nome: string): { nome: string; ano: number | null } {
  if (!nome) return { nome, ano: null };
  for (const { regex, mapaGrupos } of LIMPAR_DATA) {
    const m = regex.exec(nome);
    if (!m || m.length !== 5) continue;
    const titulo = grupoNet(m, mapaGrupos, 1), ano = inteiro(grupoNet(m, mapaGrupos, 2));
    if (titulo !== undefined && grupoNet(m, mapaGrupos, 2) !== undefined && ano !== null)
      return { nome: titulo.trimEnd(), ano };
  }
  return { nome, ano: null };
}
export function limparNome(nome: string): string | null {
  if (!nome) return null;
  let limpo = false;
  for (const { regex } of LIMPAR_NOME) {
    const m = regex.exec(nome);
    if (m?.groups && "cleaned" in m.groups && m.groups.cleaned !== undefined) { nome = m.groups.cleaned; limpo = true; }
  }
  return limpo ? nome : null;
}

// ---------- ExtraRuleResolver ----------
export function tipoDeExtra(caminho: string, raizDaBiblioteca = ""): string | null {
  const audio = ehArquivoDeAudio(caminho), video = ehArquivoDeVideo(caminho);
  const nome = nomeDoArquivo(caminho), semExtensao = nomeSemExtensao(caminho);
  const semDigitosFinais = semExtensao.replace(/[0-9]+$/, "");
  const pasta = pastaDe(caminho), nomeDaPasta = nomeDoArquivo(pasta);
  for (const regra of O.VideoExtraRules) {
    if ((regra.MediaType === "Audio" && !audio) || (regra.MediaType === "Video" && !video)) continue;
    const token = regra.Token.toLowerCase();
    const casa = regra.RuleType === "Filename" ? semExtensao.toLowerCase() === token
      : regra.RuleType === "Suffix" ? semDigitosFinais.toLowerCase().endsWith(token)
      : regra.RuleType === "Regex" ? converterRegexNet(regra.Token).regex.test(nome)
      : regra.RuleType === "DirectoryName" ? nomeDaPasta.toLowerCase() === token && pasta.toLowerCase() !== raizDaBiblioteca.toLowerCase()
      : false;
    if (casa) return regra.ExtraType;
  }
  return null;
}

// ---------- VideoResolver ----------
export interface InfoVideo { nome: string; ano: number | null; container: string | null; ehStub: boolean; extra: string | null }
export function resolverVideo(caminho: string, ehPasta: boolean, interpretarNome = true, raizDaBiblioteca = ""): InfoVideo | null {
  if (!caminho) return null;
  let container: string | null = null, ehStub = false;
  if (!ehPasta) {
    const extensao = extensaoDe(caminho);
    if (!contemSemCaixa(O.VideoFileExtensions, extensao)) {
      if (!stub(caminho).ehStub) return null;
      ehStub = true;
    }
    container = extensao.replace(/^\.+/, "") || null;
  }
  const extra = tipoDeExtra(caminho, raizDaBiblioteca);
  let nome = nomeSemExtensao(caminho), ano: number | null = null;
  if (interpretarNome) {
    ({ nome, ano } = limparDataHora(nome));
    nome = limparNome(nome) ?? nome;
  }
  return { nome, ano, container, ehStub, extra };
}
