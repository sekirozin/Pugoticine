// PQA-219: segmentos HLS idênticos aos do Jellyfin 10.11.10 (casos de DynamicHlsPlaylistGeneratorTests).
import assert from "node:assert/strict";
import test from "node:test";
import { iniciosDosSegmentos, playlistVod, segmentosIguais, segmentosPorKeyframes } from "./segmentos.js";

const ms = (v: number) => v * 10_000;
test("PQA-219: ComputeSegments do Jellyfin (alinhado aos keyframes)", () => {
  assert.deepEqual(segmentosPorKeyframes({ duracaoTicks: ms(35000), keyframesTicks: [0, ms(10427), ms(20854), ms(31240)] }, 6000), [10.427, 10.427, 10.386, 3.76]);
  assert.deepEqual(segmentosPorKeyframes({ duracaoTicks: ms(10000), keyframesTicks: [0, ms(1000), ms(2000), ms(3000), ms(4000), ms(5000)] }, 2000), [2, 2, 6]);
  assert.deepEqual(segmentosPorKeyframes({ duracaoTicks: ms(10000), keyframesTicks: [0] }, 6000), [10]);
  assert.deepEqual(segmentosPorKeyframes({ duracaoTicks: ms(10000), keyframesTicks: [] }, 6000), [10]);
  assert.throws(() => segmentosPorKeyframes({ duracaoTicks: 0, keyframesTicks: [ms(10000)] }, 6000));
});
test("PQA-219: ComputeEqualLengthSegments do Jellyfin", () => {
  assert.deepEqual(segmentosIguais(6000, ms(13000)), [6, 6, 1]);
  assert.deepEqual(segmentosIguais(3000, ms(15000)), [3, 3, 3, 3, 3]);
  assert.deepEqual(segmentosIguais(6000, ms(25000)), [6, 6, 6, 6, 1]);
  assert.deepEqual(segmentosIguais(6000, ms(20123)), [6, 6, 6, 2.123]);
  assert.deepEqual(segmentosIguais(6000, ms(1234)), [1.234]);
  assert.throws(() => segmentosIguais(0, 1000000));
  assert.throws(() => segmentosIguais(1000, 0));
});
test("PQA-219: playlist VOD completa com init fMP4 e ENDLIST", () => {
  const p = playlistVod([6, 6, 1.5], "seg/", "?s=1");
  assert.match(p, /#EXT-X-PLAYLIST-TYPE:VOD/);
  assert.match(p, /#EXT-X-MAP:URI="seg\/init\.mp4\?s=1"/);
  assert.equal((p.match(/#EXTINF/g) ?? []).length, 3);
  assert.match(p, /#EXT-X-ENDLIST\n$/);
  assert.deepEqual(iniciosDosSegmentos([10.427, 10.427, 10.386]), [0, 10.427, 20.854]);
});
