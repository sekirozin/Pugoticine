// PQA-219: HLS sob demanda como o Jellyfin, com FFmpeg real. Cada segmento começa exatamente onde a playlist diz
// (remux alinhado aos keyframes, transcode em pedaços iguais); um salto para frente reinicia o FFmpeg no segmento
// pedido (não espera a conversão chegar lá); o segmento seguinte sai do mesmo processo; a sessão é apagada no fim.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GerenciadorHls, SEGUNDOS_POR_SEGMENTO } from "./hls.js";
import { CacheKeyframes } from "./keyframes.js";
import { parseProbeOutput } from "../probe.js";
import type { MediaItem, PlaybackPlan } from "../types.js";

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "hls-"));
const video = path.join(pasta, "Filme (2020).mkv");
// Encode comum de x264 (quadros B, GOP de 250 quadros = 10,4166… s): com quadros B o FFmpeg recua ~0,13 s antes de
// buscar e um -ss no tempo exato do keyframe caía no keyframe anterior.
const videoGopQuebrado = path.join(pasta, "Gop (2021).mkv");
assert.equal(spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=120", "-f", "lavfi", "-i", "sine=duration=120",
  // Com quadros B (-bf 3): é com eles que o FFmpeg recua ~0,13 s antes de buscar (dts_heuristic) e caía no keyframe anterior.
  "-c:v", "libx264", "-preset", "veryfast", "-bf", "3", "-g", "250", "-sc_threshold", "0", "-c:a", "aac", "-shortest", videoGopQuebrado]).status, 0);
// 3 min, keyframe a cada 2 s (como um encode comum), áudio AC-3 (o navegador não toca: vira AAC).
assert.equal(spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=180", "-f", "lavfi", "-i", "sine=duration=180",
  "-c:v", "libx264", "-preset", "ultrafast", "-g", "48", "-c:a", "ac3", "-shortest", video]).status, 0);
const info = parseProbeOutput(JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", video], { encoding: "utf8" }).stdout));
const stat = fs.statSync(video);
const media = { id: "a".repeat(24), title: "Filme", year: 2020, relativePath: "Filme (2020).mkv", absolutePath: video, fileName: "Filme (2020).mkv", extension: ".mkv", size: stat.size, modifiedAt: stat.mtime.toISOString(), playbackMode: "hls", subtitles: [] } as unknown as MediaItem;
const gerenciador = new GerenciadorHls(path.join(pasta, "hls"), new CacheKeyframes(path.join(pasta, "keyframes.json")));
test.after(() => { gerenciador.parar(); fs.rmSync(pasta, { recursive: true, force: true }); });

/** Primeiro instante de vídeo do segmento (init + segmento, como o player junta). */
function inicioDoSegmento(init: string, segmento: string): { pts: number; duracao: number } {
  const junto = path.join(pasta, "junto.mp4");
  fs.writeFileSync(junto, Buffer.concat([fs.readFileSync(init), fs.readFileSync(segmento)]));
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,duration_time", "-of", "csv=p=0", junto], { encoding: "utf8" });
  const pts = r.stdout.trim().split("\n").map(l => l.split(",").map(Number));
  const inicio = Math.min(...pts.map(p => p[0]));
  const fim = Math.max(...pts.map(p => p[0] + p[1]));
  return { pts: inicio, duracao: fim - inicio };
}

for (const modo of ["remux", "transcode"] as const) {
  test(`PQA-219: ${modo} — segmentos alinhados à playlist, salto reinicia o FFmpeg no ponto pedido`, async () => {
    const plano: PlaybackPlan = { mode: modo, reason: "teste", targetHeight: null, toneMap: false, audioStreamIndex: info.audioTracks[0].streamIndex, subtitleStreamIndex: null, audioCopy: false };
    const id = gerenciador.criar("marcos", media, info, plano);
    const sessao = gerenciador.sessao(id, "marcos", media.id)!;
    const playlist = gerenciador.playlist(sessao);
    const duracoes = [...playlist.matchAll(/#EXTINF:([\d.]+),/g)].map(m => Number(m[1]));
    assert.ok(Math.abs(duracoes.reduce((a, b) => a + b, 0) - 180) < 0.2, "playlist cobre o filme inteiro desde o início");
    assert.match(playlist, /#EXT-X-ENDLIST/);
    const inicios = duracoes.map((_, i) => duracoes.slice(0, i).reduce((a, b) => a + b, 0));

    const init = await gerenciador.segmento(sessao, -1);
    const s0 = await gerenciador.segmento(sessao, 0);
    const primeiro = inicioDoSegmento(init, s0);
    assert.ok(Math.abs(primeiro.pts - inicios[0]) < 0.05, `segmento 0 começa em ${primeiro.pts}`);
    assert.ok(Math.abs(primeiro.duracao - duracoes[0]) < 0.1, `segmento 0 dura ${primeiro.duracao} (playlist ${duracoes[0]})`);
    const processoInicial = sessao.trabalho!.processo.pid;

    // Salto para ~2 min: muito além do FFmpeg atual → reinicia ali, sem converter o meio.
    const alvo = duracoes.findIndex((_, i) => inicios[i] >= 120);
    const antes = Date.now();
    const sAlvo = await gerenciador.segmento(sessao, alvo);
    const espera = Date.now() - antes;
    assert.notEqual(sessao.trabalho!.processo.pid, processoInicial, "FFmpeg reiniciado no salto");
    assert.equal(sessao.trabalho!.inicio, alvo);
    const depoisDoSalto = inicioDoSegmento(init, sAlvo);
    assert.ok(Math.abs(depoisDoSalto.pts - inicios[alvo]) < 0.05, `segmento ${alvo} começa em ${depoisDoSalto.pts}, playlist ${inicios[alvo]}`);
    assert.ok(Math.abs(depoisDoSalto.duracao - duracoes[alvo]) < 0.1, `segmento ${alvo} dura ${depoisDoSalto.duracao}`);
    assert.ok(!fs.existsSync(path.join(sessao.pasta, `${Math.floor(alvo / 2)}.mp4`)), "o meio do filme não foi convertido");
    console.log(`${modo}: ${duracoes.length} segmentos; salto para ${inicios[alvo].toFixed(1)} s respondeu em ${espera} ms`);

    // O seguinte vem do mesmo FFmpeg.
    const pidSalto = sessao.trabalho!.processo.pid;
    const seguinte = inicioDoSegmento(init, await gerenciador.segmento(sessao, alvo + 1));
    assert.equal(sessao.trabalho!.processo.pid, pidSalto, "sem reiniciar no segmento seguinte");
    assert.ok(Math.abs(seguinte.pts - inicios[alvo + 1]) < 0.05);

    // Voltar para trás (já gerado: serve na hora; não gerado: reinicia).
    assert.equal(await gerenciador.segmento(sessao, 0), s0);
    const s3 = await gerenciador.segmento(sessao, 3);
    assert.ok(Math.abs(inicioDoSegmento(init, s3).pts - inicios[3]) < 0.05);

    gerenciador.encerrar(id);
    assert.ok(!fs.existsSync(sessao.pasta), "pasta da sessão apagada");
  });
}

test("PQA-219: remux com quadros B — reiniciar o FFmpeg num segmento anterior gera o conteúdo dele, não o do anterior", async () => {
  const infoGop = parseProbeOutput(JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", videoGopQuebrado], { encoding: "utf8" }).stdout));
  const st = fs.statSync(videoGopQuebrado);
  const mediaGop = { ...media, id: "b".repeat(24), absolutePath: videoGopQuebrado, relativePath: "Gop (2021).mkv", fileName: "Gop (2021).mkv", size: st.size, modifiedAt: st.mtime.toISOString() } as MediaItem;
  const plano: PlaybackPlan = { mode: "remux", reason: "teste", targetHeight: null, toneMap: false, audioStreamIndex: infoGop.audioTracks[0].streamIndex, subtitleStreamIndex: null, audioCopy: true };
  const id = gerenciador.criar("mael", mediaGop, infoGop, plano);
  const sessao = gerenciador.sessao(id, "mael", mediaGop.id)!;
  const duracoes = [...gerenciador.playlist(sessao).matchAll(/#EXTINF:([\d.]+),/g)].map(m => Number(m[1]));
  const inicios = duracoes.map((_, i) => duracoes.slice(0, i).reduce((a, b) => a + b, 0));
  assert.ok(duracoes.length >= 8 && Math.abs(duracoes[1] - 10.417) < 0.01, `segmentos de ~10,417 s: ${duracoes.slice(0, 3)}`);
  // Como o braço 3 viu: começa no meio (retomada) e depois volta (cada volta reinicia o FFmpeg num segmento anterior).
  // O init vem depois do primeiro segmento, senão o FFmpeg começaria do 0 e geraria tudo sem reinício.
  const ordem = [8, 7, 5];
  const primeiro = await gerenciador.segmento(sessao, ordem[0]);
  const init = await gerenciador.segmento(sessao, -1);
  for (const n of ordem) {
    const pids = sessao.trabalho!.processo.pid;
    const seg = inicioDoSegmento(init, n === ordem[0] ? primeiro : await gerenciador.segmento(sessao, n));
    if (n !== ordem[0]) assert.notEqual(sessao.trabalho!.processo.pid, pids, `voltar para ${n} reinicia o FFmpeg`);
    assert.ok(Math.abs(seg.pts - inicios[n]) < 0.05, `segmento ${n} começa em ${seg.pts.toFixed(3)}, playlist ${inicios[n].toFixed(3)}`);
  }
  gerenciador.encerrar(id);
});

test("PQA-222: linha de comando da GPU (VAAPI) como a do Jellyfin, e software quando não dá", async () => {
  const { argumentosFfmpeg } = await import("./hls.js");
  const plano: PlaybackPlan = { mode: "transcode", reason: "teste", targetHeight: 720, toneMap: false, audioStreamIndex: info.audioTracks[0].streamIndex, subtitleStreamIndex: null, audioCopy: false };
  const base = { entrada: video, info, plano, copiaVideo: false, segmento: 3, inicioSegundos: 18, pasta };
  const gpuLeH264 = argumentosFfmpeg({ ...base, aceleracao: { dispositivo: "/dev/dri/renderD128", decodifica: ["h264"] } }).join(" ");
  assert.match(gpuLeH264, /-hwaccel vaapi -hwaccel_device \/dev\/dri\/renderD128 -hwaccel_output_format vaapi/);
  assert.match(gpuLeH264, /-vf scale_vaapi=format=nv12:w=-2:h='min\(720,ih\)' -c:v h264_vaapi/);
  assert.match(gpuLeH264, /-force_key_frames:0 expr:gte\(t,n_forced\*6\)/);
  const gpuSoCodifica = argumentosFfmpeg({ ...base, aceleracao: { dispositivo: "/dev/dri/renderD128", decodifica: [] } }).join(" ");
  assert.match(gpuSoCodifica, /-init_hw_device vaapi=va:\/dev\/dri\/renderD128 -filter_hw_device va/);
  assert.match(gpuSoCodifica, /-vf scale=w=-2:h='min\(720,ih\)',format=nv12,hwupload -c:v h264_vaapi/);
  assert.doesNotMatch(gpuSoCodifica, /-hwaccel /);
  const software = argumentosFfmpeg({ ...base, aceleracao: null }).join(" ");
  assert.match(software, /-c:v libx264/);
  assert.doesNotMatch(software, /vaapi/);
  // Remux nunca usa a GPU (só copia); tone mapping também fica no software.
  assert.doesNotMatch(argumentosFfmpeg({ ...base, copiaVideo: true, aceleracao: { dispositivo: "/dev/dri/renderD128", decodifica: ["h264"] } }).join(" "), /vaapi/);
  assert.doesNotMatch(argumentosFfmpeg({ ...base, plano: { ...plano, toneMap: true }, aceleracao: { dispositivo: "/dev/dri/renderD128", decodifica: ["h264"] } }).join(" "), /vaapi/);
});

test("PQA-222: se a GPU falha, a sessão passa para software sozinha e o segmento sai igual", async () => {
  const quebrada = new GerenciadorHls(path.join(pasta, "hls-gpu"), new CacheKeyframes(path.join(pasta, "keyframes2.json")), "ffmpeg", { dispositivo: path.join(pasta, "gpu-inexistente"), decodifica: ["h264"] });
  try {
    const plano: PlaybackPlan = { mode: "transcode", reason: "teste", targetHeight: null, toneMap: false, audioStreamIndex: info.audioTracks[0].streamIndex, subtitleStreamIndex: null, audioCopy: false };
    const id = quebrada.criar("ivis", media, info, plano);
    const sessao = quebrada.sessao(id, "ivis", media.id)!;
    const s4 = await quebrada.segmento(sessao, 4);
    assert.equal(sessao.semGpu, true, "marcou a sessão como software");
    assert.equal(sessao.trabalho!.gpu, false);
    const init = await quebrada.segmento(sessao, -1);
    assert.ok(Math.abs(inicioDoSegmento(init, s4).pts - 24) < 0.05, "segmento 4 começa em 24 s");
  } finally { quebrada.parar(); }
});
