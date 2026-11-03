// Painel do administrador: o equivalente à página inicial do Painel do Jellyfin 10.11.10
// (jellyfin-web src/apps/dashboard/routes/index.tsx). Cada bloco corresponde a um widget de lá:
//   ServerInfoWidget  → GET /System/Info            (servidor: versão, sistema, recursos)
//   ItemCountsWidget  → GET /Items/Counts           (contagens da biblioteca)
//   DevicesWidget     → GET /Sessions               (quem está assistindo agora)
//   ActivityLogWidget → GET /System/ActivityLog/Entries (atividade recente)
//   RunningTasksWidget→ GET /ScheduledTasks         (tarefas agendadas)
//   ServerPathWidget  → GET /System/Info/Storage    (caminhos e espaço em disco)
//   bibliotecas/varredura → GET /Library/VirtualFolders + POST /Library/Refresh
// "Assistindo agora" vem do progresso que o player grava a cada 15 s: atualizado há menos de 60 s e não concluído.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import type { MediaItem } from "../types.js";

export const JANELA_ASSISTINDO_MS = 60_000;

export interface RegistroAtividade { usuario: string; mediaId: string; posicao: number; duracao: number; concluido: boolean; atualizadoEm: string }
export interface Disco { caminho: string; rotulo: string; totalBytes: number | null; livreBytes: number | null }
export interface EntradaPainel {
  catalogo: MediaItem[]; ultimaVarredura: string; intervaloVarreduraMs: number; raizMidia: string;
  atividade: RegistroAtividade[]; agora: Date; servidor: InfoServidor; discos: Disco[];
}
export interface InfoServidor {
  nome: string; versao: string; node: string; sistema: string; arquitetura: string; cpu: string; nucleos: number;
  cargaMedia: number[]; memoriaTotal: number; memoriaLivre: number; memoriaProcesso: number;
  ligadoDesde: string; ffmpeg: string;
}

let ffmpegVersao: string | null = null;
/** Primeira linha do `ffmpeg -version` (guardada; não muda com o servidor ligado). */
export function versaoFfmpeg(ffmpeg = "ffmpeg"): string {
  if (ffmpegVersao !== null) return ffmpegVersao;
  const r = spawnSync(ffmpeg, ["-version"], { encoding: "utf8", timeout: 5000 });
  ffmpegVersao = r.status === 0 ? (r.stdout.split("\n")[0].match(/ffmpeg version (\S+)/)?.[1] ?? "desconhecida") : "não encontrado";
  return ffmpegVersao;
}

export function infoServidor(versaoApp: string, ffmpeg = "ffmpeg"): InfoServidor {
  const cpus = os.cpus();
  return {
    nome: "PugotiCine", versao: versaoApp, node: process.version, sistema: `${os.type()} ${os.release()}`,
    arquitetura: os.arch(), cpu: cpus[0]?.model?.trim() ?? "desconhecida", nucleos: cpus.length,
    cargaMedia: os.loadavg().map(v => Math.round(v * 100) / 100), memoriaTotal: os.totalmem(), memoriaLivre: os.freemem(),
    memoriaProcesso: process.memoryUsage().rss, ligadoDesde: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    ffmpeg: versaoFfmpeg(ffmpeg)
  };
}

/** Espaço da partição de cada caminho (GetSystemStorage). */
export function disco(caminho: string, rotulo: string): Disco {
  try {
    const s = fs.statfsSync(caminho);
    return { caminho, rotulo, totalBytes: s.blocks * s.bsize, livreBytes: s.bavail * s.bsize };
  } catch {
    return { caminho, rotulo, totalBytes: null, livreBytes: null };
  }
}

export function montarPainel(e: EntradaPainel) {
  const porId = new Map(e.catalogo.map(m => [m.id, m]));
  const titulo = (id: string) => { const m = porId.get(id); return m ? { titulo: m.title, ano: m.year } : { titulo: "Título removido", ano: null }; };
  const assistindo = e.atividade
    .filter(a => !a.concluido && e.agora.getTime() - Date.parse(a.atualizadoEm) < JANELA_ASSISTINDO_MS)
    .map(a => ({ ...a, ...titulo(a.mediaId), percentual: a.duracao ? Math.round(a.posicao / a.duracao * 100) : 0 }));
  const ultima = e.ultimaVarredura ? Date.parse(e.ultimaVarredura) : NaN;
  const proxima = Number.isFinite(ultima) ? new Date(ultima + e.intervaloVarreduraMs).toISOString() : null;
  return {
    servidor: e.servidor,
    contagens: {
      filmes: e.catalogo.length,
      tamanhoBytes: e.catalogo.reduce((soma, m) => soma + (m.size || 0), 0),
      legendas: e.catalogo.reduce((soma, m) => soma + (m.subtitles?.length ?? 0), 0),
      usuariosComAtividade: new Set(e.atividade.map(a => a.usuario)).size
    },
    assistindo,
    atividade: e.atividade.slice(0, 20).map(a => ({ ...a, ...titulo(a.mediaId) })),
    bibliotecas: [{ nome: "Filmes", tipo: "filmes", caminho: e.raizMidia, itens: e.catalogo.length, ultimaVarredura: e.ultimaVarredura || null, proximaVarredura: proxima }],
    tarefas: [
      { nome: "Varrer a biblioteca de mídia", categoria: "Biblioteca", intervaloMinutos: Math.round(e.intervaloVarreduraMs / 60000), ultimaExecucao: e.ultimaVarredura || null, proximaExecucao: proxima },
      { nome: "Atualizar metadados do Radarr", categoria: "Metadados", intervaloMinutos: Math.round(e.intervaloVarreduraMs / 60000), ultimaExecucao: e.ultimaVarredura || null, proximaExecucao: proxima }
    ],
    discos: e.discos
  };
}
