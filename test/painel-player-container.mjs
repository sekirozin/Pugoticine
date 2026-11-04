// PQA-223: o que se salva no Painel › Reprodução › Transcodificação muda o player de verdade (PugotiCine em Docker,
// compose.desenvolvimento.yml): "Nenhum" converte por software com o preset e o CRF escolhidos; "VAAPI" volta para a GPU.
// Ao final restaura o que estava salvo antes. Uso: node test/painel-player-container.mjs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const BASE = process.env.PUGOTICINE_URL ?? "http://127.0.0.1:3012";
const CONTAINER = process.env.PUGOTICINE_CONTAINER ?? "pugoticine-pugoticine-1";
const admin = { cookie: "pugotilab_session=dev-sekiro", "content-type": "application/json" };
const pagina = `${BASE}/api/painel/config/reproducao-transcodificacao`;
const antes = (await (await fetch(pagina, { headers: admin })).json()).valores;
const salvar = async (valores) => { const r = await fetch(pagina, { method: "PUT", headers: admin, body: JSON.stringify(valores) }); assert.equal(r.status, 200, await r.text()); };
const id = (await (await fetch(`${BASE}/api/bootstrap`, { headers: admin })).json()).media.find(m => m.title === "Teste Longo").id;
async function ffmpegDaConversao() {
  await fetch(`${BASE}/api/media/${id}/hls`, { method: "DELETE", headers: admin });
  const r = await (await fetch(`${BASE}/api/media/${id}/playback`, { method: "POST", headers: admin, body: JSON.stringify({ quality: "720", capabilities: { videoCodecs: ["h264"], audioCodecs: ["aac"] } }) })).json();
  assert.equal(r.plan.mode, "transcode");
  const segmento = await fetch(BASE + r.url.replace("main.m3u8", "0.mp4"), { headers: admin });
  assert.equal(segmento.status, 200);
  // Só o FFmpeg desta sessão (outras sessões abertas por outros testes podem estar rodando).
  const sessao = r.url.match(/hls\/([0-9a-f-]{36})\//)[1];
  return execFileSync("docker", ["exec", CONTAINER, "sh", "-c", "ps -o args | grep [f]fmpeg || true"], { encoding: "utf8" }).split("\n").filter(l => l.includes(sessao)).join("\n");
}
try {
  await salvar({ ...antes, HardwareAccelerationType: "none", EncoderPreset: "faster", H264Crf: 20 });
  const software = await ffmpegDaConversao();
  assert.match(software, /-c:v libx264 -preset faster -crf 20/, software);
  assert.doesNotMatch(software, /vaapi/);
  await salvar({ ...antes, HardwareAccelerationType: "vaapi", VaapiDevice: "/dev/dri/renderD128", EnableHardwareEncoding: true });
  const gpu = await ffmpegDaConversao();
  assert.match(gpu, /-c:v h264_vaapi/, gpu);
  // Codificação por hardware desligada: volta ao software mesmo com VAAPI escolhido.
  await salvar({ ...antes, HardwareAccelerationType: "vaapi", EnableHardwareEncoding: false });
  assert.match(await ffmpegDaConversao(), /-c:v libx264/);
  console.log("PQA-223 ok");
} finally {
  await salvar({ ...antes, HardwareAccelerationType: "vaapi" });
  await fetch(`${BASE}/api/media/${id}/hls`, { method: "DELETE", headers: admin });
}
