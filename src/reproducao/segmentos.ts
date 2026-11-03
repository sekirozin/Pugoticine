// Segmentos e playlist HLS VOD, porte do Jellyfin 10.11.10 (DynamicHlsPlaylistGenerator):
//  - vídeo copiado (remux): cortes nos keyframes, a cada `alvo` acumulado desde o zero (o FFmpeg com -copyts e
//    -start_number corta nos mesmos pontos, então qualquer segmento pode ser gerado isolado);
//  - vídeo recodificado: segmentos de tamanho igual (o FFmpeg cria os keyframes com -force_key_frames).
// A playlist sai completa desde o início (#EXT-X-ENDLIST): o player sabe a duração e pode pular para qualquer ponto.
import type { DadosKeyframes } from "./keyframes.js";

const TICKS_POR_SEGUNDO = 10_000_000;
const TICKS_POR_MS = 10_000;

/** ComputeSegments: durações (s) alinhadas aos keyframes. */
export function segmentosPorKeyframes(dados: DadosKeyframes, alvoMs: number): number[] {
  const { keyframesTicks, duracaoTicks } = dados;
  if (keyframesTicks.length > 0 && duracaoTicks < keyframesTicks[keyframesTicks.length - 1])
    throw new Error("Duração menor que o último keyframe.");
  const alvo = alvoMs * TICKS_POR_MS;
  let ultimo = 0, corte = alvo;
  const resultado: number[] = [];
  for (const keyframe of keyframesTicks) {
    if (keyframe >= corte) {
      resultado.push((keyframe - ultimo) / TICKS_POR_SEGUNDO);
      ultimo = keyframe;
      corte += alvo;
    }
  }
  resultado.push((duracaoTicks - ultimo) / TICKS_POR_SEGUNDO);
  return resultado;
}

/** ComputeEqualLengthSegments */
export function segmentosIguais(alvoMs: number, duracaoTicks: number): number[] {
  if (!alvoMs || !duracaoTicks) throw new Error("Tamanho de segmento ou duração inválidos.");
  const alvo = alvoMs * TICKS_POR_MS;
  const inteiros = Math.floor(duracaoTicks / alvo), resto = duracaoTicks % alvo;
  const resultado = Array<number>(inteiros).fill(alvoMs / 1000);
  if (resto) resultado.push(resto / TICKS_POR_SEGUNDO);
  return resultado;
}

/** Início (s) de cada segmento. */
export function iniciosDosSegmentos(duracoes: number[]): number[] {
  const inicios: number[] = [];
  let ticks = 0;
  for (const d of duracoes) { inicios.push(ticks / TICKS_POR_SEGUNDO); ticks += Math.round(d * TICKS_POR_SEGUNDO); }
  return inicios;
}

/** Playlist VOD com fMP4 (init + segmentos), como a do Jellyfin. */
export function playlistVod(duracoes: number[], prefixo: string, consulta: string): string {
  const linhas = ["#EXTM3U", "#EXT-X-PLAYLIST-TYPE:VOD", "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${Math.ceil(Math.max(...duracoes))}`, "#EXT-X-MEDIA-SEQUENCE:0",
    `#EXT-X-MAP:URI="${prefixo}init.mp4${consulta}"`];
  duracoes.forEach((d, i) => linhas.push(`#EXTINF:${d.toFixed(6)},`, `${prefixo}${i}.mp4${consulta}`));
  linhas.push("#EXT-X-ENDLIST", "");
  return linhas.join("\n");
}
