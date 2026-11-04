// Bibliotecas (Painel › Bibliotecas), como as "pastas virtuais" do Jellyfin 10.11.10 (LibraryStructureController +
// LibraryManager): cada biblioteca tem nome, tipo de conteúdo, pastas e opções; o catálogo do app é a soma das
// bibliotecas ativas. A biblioteca padrão (MEDIA_ROOT) mantém os IDs de sempre, então progresso e salas continuam.
// Séries/animes: o título de cada episódio vem das regras de nomes do Jellyfin (src/nomes).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { Catalog } from "../catalog.js";
import { nomeDaSerie, resolverEpisodio } from "../nomes/jellyfin.js";
import type { MediaItem } from "../types.js";

export const TIPOS_BIBLIOTECA = [
  { valor: "movies", rotulo: "Filmes" }, { valor: "tvshows", rotulo: "Séries" }, { valor: "mixed", rotulo: "Filmes e Séries Misturados" },
  { valor: "musicvideos", rotulo: "Videoclipes" }, { valor: "homevideos", rotulo: "Vídeos e Fotos Caseiros" },
  { valor: "music", rotulo: "Música" }, { valor: "books", rotulo: "Livros" }
] as const;
export type TipoBiblioteca = (typeof TIPOS_BIBLIOTECA)[number]["valor"];
const SO_VIDEO = new Set(["music", "books"]);

export interface Biblioteca {
  id: string; nome: string; tipo: TipoBiblioteca; pastas: string[]; ativa: boolean; monitorar: boolean;
  idiomaMetadados: string; paisMetadados: string; intervaloAtualizacaoDias: number; criadaEm: string; ultimaVarredura: string | null;
}
/** Episódio de série (como Series › Season › Episode do Jellyfin); o id da série é estável por biblioteca + nome. */
export interface InfoSerie { id: string; nome: string; temporada: number; episodio: number; episodioFinal: number | null; nomeEpisodio: string | null }
export type ItemBiblioteca = MediaItem & { bibliotecaId: string; bibliotecaNome: string; bibliotecaTipo: TipoBiblioteca; serie?: InfoSerie };

/** Nome do episódio a partir do arquivo: o texto entre "S01E04" e a qualidade/fonte ("1080p", "WEB-DL"...). */
export function nomeDoEpisodioNoArquivo(arquivo: string): string | null {
  const base = path.basename(arquivo, path.extname(arquivo));
  const marca = base.match(/S\d{1,2}E\d{1,4}(?:-?E\d{1,4})?/i);
  if (!marca || marca.index === undefined) return null;
  let resto = base.slice(marca.index + marca[0].length);
  const corte = resto.search(/(?:^|[ ._\-\[(])(?:\d{3,4}p|(?:19|20)\d{2}|WEB|WEBRip|WEB-DL|CR|AMZN|NF|DSNP|HMAX|BluRay|BDRip|HDTV|DVDRip|x26[45]|H\.?26[45]|HEVC|AVC|AAC|DDP?|DUAL|MULTI|ENG|JAP|ITA)(?:[ ._\-\])]|$)/i);
  if (corte >= 0) resto = resto.slice(0, corte);
  const nome = resto.replace(/[._]+/g, " ").replace(/^[\s\-–:]+|[\s\-–:]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return nome.length >= 2 ? nome : null;
}

const ID_PADRAO = "filmes";

export class GerenciadorBibliotecas {
  private itens = new Map<string, ItemBiblioteca>();
  private observadores = new Map<string, fs.FSWatcher[]>();
  private agendadas = new Map<string, NodeJS.Timeout>();
  constructor(private readonly db: Database.Database, private readonly raizPadrao: string, private readonly raizesPermitidas: string[], private readonly aoMudar: (biblioteca: Biblioteca) => void = () => {}) {
    db.exec(`CREATE TABLE IF NOT EXISTS bibliotecas (id TEXT PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL, pastas TEXT NOT NULL,
      ativa INTEGER NOT NULL DEFAULT 1, monitorar INTEGER NOT NULL DEFAULT 0, idiomaMetadados TEXT NOT NULL DEFAULT 'pt',
      paisMetadados TEXT NOT NULL DEFAULT 'BR', intervaloAtualizacaoDias INTEGER NOT NULL DEFAULT 0, criadaEm TEXT NOT NULL, ultimaVarredura TEXT)`);
    if (!(db.prepare("SELECT COUNT(*) n FROM bibliotecas").get() as { n: number }).n)
      db.prepare("INSERT INTO bibliotecas (id, nome, tipo, pastas, criadaEm) VALUES (?, 'Filmes', 'movies', ?, ?)").run(ID_PADRAO, JSON.stringify([raizPadrao]), new Date().toISOString());
    this.monitorarTodas();
  }

  // ---------- leitura ----------
  bibliotecas(): Array<Biblioteca & { itens: number }> {
    return (this.db.prepare("SELECT * FROM bibliotecas ORDER BY criadaEm").all() as Record<string, unknown>[]).map(r => {
      const b = this.paraBiblioteca(r);
      return { ...b, itens: [...this.itens.values()].filter(i => i.bibliotecaId === b.id).length };
    });
  }
  biblioteca(id: string): Biblioteca | null {
    const r = this.db.prepare("SELECT * FROM bibliotecas WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.paraBiblioteca(r) : null;
  }
  private paraBiblioteca(r: Record<string, unknown>): Biblioteca {
    return { id: String(r.id), nome: String(r.nome), tipo: r.tipo as TipoBiblioteca, pastas: JSON.parse(String(r.pastas)), ativa: Boolean(r.ativa), monitorar: Boolean(r.monitorar),
      idiomaMetadados: String(r.idiomaMetadados), paisMetadados: String(r.paisMetadados), intervaloAtualizacaoDias: Number(r.intervaloAtualizacaoDias),
      criadaEm: String(r.criadaEm), ultimaVarredura: r.ultimaVarredura ? String(r.ultimaVarredura) : null };
  }

  // ---------- catálogo (mesma interface do Catalog) ----------
  list(): ItemBiblioteca[] { return [...this.itens.values()]; }
  get(id: string): ItemBiblioteca | null { return this.itens.get(id) ?? null; }
  scan(): ItemBiblioteca[] {
    for (const b of this.bibliotecas()) this.varrerSemJuntar(b);
    this.removerOrfaos();
    return this.list();
  }
  /** Rastrear uma biblioteca só (botão da biblioteca no Painel). */
  varrer(id: string): number {
    const b = this.biblioteca(id);
    if (!b) throw new Error("Biblioteca não encontrada.");
    this.varrerSemJuntar(b);
    return this.list().filter(i => i.bibliotecaId === id).length;
  }
  private removerOrfaos(): void {
    const ids = new Set(this.bibliotecas().filter(b => b.ativa).map(b => b.id));
    for (const [id, item] of this.itens) if (!ids.has(item.bibliotecaId)) this.itens.delete(id);
  }
  private varrerSemJuntar(b: Biblioteca): void {
    for (const [id, item] of this.itens) if (item.bibliotecaId === b.id) this.itens.delete(id);
    if (b.ativa) {
      b.pastas.forEach((pasta, indice) => {
        if (!fs.existsSync(pasta)) { console.warn(`Biblioteca ${b.nome}: a pasta ${pasta} não existe.`); return; }
        for (const original of new Catalog(pasta).scan()) {
          // Primeira pasta da biblioteca padrão: o ID de sempre. As demais: ID derivado (mesmo formato de 24 hex).
          const id = b.id === ID_PADRAO && indice === 0 ? original.id : crypto.createHash("sha256").update(`${b.id}:${indice}:${original.id}`).digest("hex").slice(0, 24);
          const item: ItemBiblioteca = { ...original, id, bibliotecaId: b.id, bibliotecaNome: b.nome, bibliotecaTipo: b.tipo };
          if (b.tipo === "tvshows" || b.tipo === "mixed") this.nomearEpisodio(item, pasta);
          if (this.itens.has(id)) { console.warn(`Biblioteca ${b.nome}: ${original.relativePath} repetido, ignorado.`); continue; }
          this.itens.set(id, item);
        }
      });
    }
    this.db.prepare("UPDATE bibliotecas SET ultimaVarredura = ? WHERE id = ?").run(new Date().toISOString(), b.id);
  }
  /** "Série · T1E04" pelas regras do Jellyfin (EpisodeResolver + SeriesResolver); filme fica como está. */
  private nomearEpisodio(item: ItemBiblioteca, raiz: string): void {
    const ep = resolverEpisodio(item.absolutePath, false);
    if (!ep?.episodio) return;
    const primeiraPasta = item.relativePath.split(/[\\/]/)[0];
    const serie = item.relativePath.includes("/") ? nomeDaSerie(path.join(raiz, primeiraPasta)) : (ep.serie || item.title);
    const temporada = ep.temporada ?? 1;
    item.serie = {
      id: crypto.createHash("sha256").update(`${item.bibliotecaId}:serie:${serie.toLocaleLowerCase("pt-BR")}`).digest("hex").slice(0, 24),
      nome: serie, temporada, episodio: ep.episodio, episodioFinal: ep.episodioFinal ?? null, nomeEpisodio: nomeDoEpisodioNoArquivo(item.absolutePath)
    };
    item.title = `${serie} · T${temporada}E${String(ep.episodio).padStart(2, "0")}${ep.episodioFinal ? `-E${String(ep.episodioFinal).padStart(2, "0")}` : ""}`;
    item.year = null;
  }

  // ---------- edição ----------
  private validar(dados: Partial<Biblioteca>, atual?: Biblioteca): Biblioteca {
    const nome = String(dados.nome ?? atual?.nome ?? "").trim();
    if (!nome || nome.length > 80) throw new Error("Nome para exibição: informe de 1 a 80 caracteres.");
    const outras = this.bibliotecas().filter(b => b.id !== atual?.id);
    if (outras.some(b => b.nome.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"))) throw new Error("Já existe uma biblioteca com esse nome.");
    const tipo = (dados.tipo ?? atual?.tipo) as TipoBiblioteca;
    if (!TIPOS_BIBLIOTECA.some(t => t.valor === tipo)) throw new Error("Tipo de conteúdo inválido.");
    const pastasEntrada = dados.pastas ?? atual?.pastas ?? [];
    if (!Array.isArray(pastasEntrada) || !pastasEntrada.length) throw new Error("Pastas: adicione ao menos uma pasta.");
    const pastas = [...new Set(pastasEntrada.map(p => path.resolve(String(p).trim())))];
    for (const pasta of pastas) {
      if (!this.raizesPermitidas.some(r => pasta === r || pasta.startsWith(r + path.sep))) throw new Error(`A pasta ${pasta} está fora das pastas de mídia permitidas (${this.raizesPermitidas.join(", ")}).`);
      let stat: fs.Stats;
      try { stat = fs.statSync(pasta); } catch { throw new Error(`A pasta ${pasta} não existe.`); }
      if (!stat.isDirectory()) throw new Error(`${pasta} não é uma pasta.`);
      try { fs.accessSync(pasta, fs.constants.R_OK); } catch { throw new Error(`Sem permissão de leitura em ${pasta}.`); }
      const repetida = outras.find(b => b.pastas.includes(pasta));
      if (repetida) throw new Error(`A pasta ${pasta} já está na biblioteca ${repetida.nome}.`);
    }
    const bool = (v: unknown, padrao: boolean) => v === undefined ? padrao : v === true;
    const intervalo = Number(dados.intervaloAtualizacaoDias ?? atual?.intervaloAtualizacaoDias ?? 0);
    if (![0, 30, 60, 90].includes(intervalo)) throw new Error("Intervalo de atualização inválido.");
    return { id: atual?.id ?? crypto.randomUUID().slice(0, 8), nome, tipo, pastas, ativa: bool(dados.ativa, atual?.ativa ?? true), monitorar: bool(dados.monitorar, atual?.monitorar ?? false),
      idiomaMetadados: String(dados.idiomaMetadados ?? atual?.idiomaMetadados ?? "pt").slice(0, 10), paisMetadados: String(dados.paisMetadados ?? atual?.paisMetadados ?? "BR").slice(0, 10),
      intervaloAtualizacaoDias: intervalo, criadaEm: atual?.criadaEm ?? new Date().toISOString(), ultimaVarredura: atual?.ultimaVarredura ?? null };
  }
  criar(dados: Partial<Biblioteca>): Biblioteca {
    const b = this.validar(dados);
    this.db.prepare("INSERT INTO bibliotecas (id, nome, tipo, pastas, ativa, monitorar, idiomaMetadados, paisMetadados, intervaloAtualizacaoDias, criadaEm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(b.id, b.nome, b.tipo, JSON.stringify(b.pastas), b.ativa ? 1 : 0, b.monitorar ? 1 : 0, b.idiomaMetadados, b.paisMetadados, b.intervaloAtualizacaoDias, b.criadaEm);
    this.varrer(b.id);
    this.monitorarTodas();
    return this.biblioteca(b.id)!;
  }
  atualizar(id: string, dados: Partial<Biblioteca>): Biblioteca {
    const atual = this.biblioteca(id);
    if (!atual) throw new Error("Biblioteca não encontrada.");
    const b = this.validar(dados, atual);
    this.db.prepare("UPDATE bibliotecas SET nome = ?, tipo = ?, pastas = ?, ativa = ?, monitorar = ?, idiomaMetadados = ?, paisMetadados = ?, intervaloAtualizacaoDias = ? WHERE id = ?")
      .run(b.nome, b.tipo, JSON.stringify(b.pastas), b.ativa ? 1 : 0, b.monitorar ? 1 : 0, b.idiomaMetadados, b.paisMetadados, b.intervaloAtualizacaoDias, id);
    this.varrer(id);
    this.monitorarTodas();
    return this.biblioteca(id)!;
  }
  remover(id: string): void {
    if (!this.biblioteca(id)) throw new Error("Biblioteca não encontrada.");
    this.db.prepare("DELETE FROM bibliotecas WHERE id = ?").run(id);
    for (const [itemId, item] of this.itens) if (item.bibliotecaId === id) this.itens.delete(itemId);
    this.monitorarTodas();
  }
  /** Só reproduz vídeo: Música e Livros aparecem, mas a varredura não acha nada tocável. */
  static somenteVideo(tipo: string): boolean { return SO_VIDEO.has(tipo); }

  // ---------- monitoramento em tempo real (EnableRealtimeMonitor) ----------
  private monitorarTodas(): void {
    for (const lista of this.observadores.values()) lista.forEach(o => o.close());
    this.observadores.clear();
    for (const b of this.bibliotecas()) {
      if (!b.ativa || !b.monitorar) continue;
      const lista: fs.FSWatcher[] = [];
      for (const pasta of b.pastas) {
        try {
          lista.push(fs.watch(pasta, { recursive: true, persistent: false }, () => this.agendar(b.id)));
        } catch (erro) { console.warn(`Biblioteca ${b.nome}: não foi possível monitorar ${pasta} (${erro instanceof Error ? erro.message : erro}).`); }
      }
      this.observadores.set(b.id, lista);
    }
  }
  private agendar(id: string): void {
    clearTimeout(this.agendadas.get(id));
    // Como o LibraryMonitorDelay do Jellyfin: espera os arquivos pararem de mudar antes de varrer.
    this.agendadas.set(id, setTimeout(() => {
      this.agendadas.delete(id);
      const b = this.biblioteca(id);
      if (!b) return;
      this.varrer(id);
      console.log(`Biblioteca ${b.nome}: mudanças nas pastas, varredura feita.`);
      this.aoMudar(b);
    }, 5000));
  }
  parar(): void {
    for (const lista of this.observadores.values()) lista.forEach(o => o.close());
    for (const t of this.agendadas.values()) clearTimeout(t);
  }
}

// ---------- controle dos pais (Usuários › Controle dos pais) ----------
/** Idade mínima pela classificação (EUA e Brasil); null = sem classificação conhecida. */
export function idadeDaClassificacao(certificacao: string | undefined | null): number | null {
  const c = String(certificacao ?? "").trim().toUpperCase().replace(/^BR-/, "");
  if (!c || ["NR", "UNRATED", "NOT RATED"].includes(c)) return null;
  const tabela: Record<string, number> = { G: 0, "TV-Y": 0, "TV-G": 0, L: 0, "TV-Y7": 7, PG: 10, "TV-PG": 10, "PG-13": 13, "TV-14": 14, R: 17, "TV-MA": 17, "NC-17": 18 };
  if (c in tabela) return tabela[c];
  const n = Number(c.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 21 ? n : null;
}

/** O usuário pode ver o item? (acesso à biblioteca + classificação etária, como a UserPolicy do Jellyfin). */
export function usuarioPodeVer(u: { todasBibliotecas: boolean; bibliotecas: string[]; classificacaoMaxima: number | null; bloquearSemClassificacao: boolean } | null,
  item: { bibliotecaId?: string; metadata?: { certification?: string } }): boolean {
  if (!u) return true;
  if (!u.todasBibliotecas && !u.bibliotecas.includes(item.bibliotecaId ?? "")) return false;
  const idade = idadeDaClassificacao(item.metadata?.certification);
  if (idade === null) return !u.bloquearSemClassificacao;
  return u.classificacaoMaxima === null || idade <= u.classificacaoMaxima;
}
