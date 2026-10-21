import assert from "node:assert/strict";
import test from "node:test";
import { parseProbeOutput } from "./probe.js";

test("identifica codecs, faixas e HDR", () => {
  const info = parseProbeOutput({
    format: { format_name: "matroska,webm", duration: "120.5", bit_rate: "8000000" },
    streams: [
      { index: 0, codec_type: "video", codec_name: "hevc", width: 3840, height: 2160, color_transfer: "smpte2084" },
      { index: 1, codec_type: "audio", codec_name: "truehd", channels: 8, tags: { language: "por" }, disposition: { default: 1 } },
      { index: 2, codec_type: "subtitle", codec_name: "hdmv_pgs_subtitle", tags: { language: "por" } }
    ]
  });
  assert.equal(info.video?.hdr, true);
  assert.equal(info.audioTracks[0]?.codec, "truehd");
  assert.equal(info.subtitleTracks[0]?.kind, "bitmap");
});
