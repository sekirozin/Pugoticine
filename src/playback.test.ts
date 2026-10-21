import assert from "node:assert/strict";
import test from "node:test";
import { createPlaybackPlan } from "./playback.js";
import type { MediaItem, MediaTechnicalInfo } from "./types.js";

const media = { extension: ".mkv" } as MediaItem;
const info = {
  container: "matroska", duration: 120, bitrate: 8_000_000,
  video: { streamIndex: 0, codec: "h264", profile: "High", width: 1920, height: 1080,
    bitrate: 7_000_000, frameRate: 24, hdr: false, colorTransfer: "bt709" },
  audioTracks: [{ streamIndex: 1, relativeIndex: 0, codec: "dts", language: "eng", title: "",
    channels: 6, channelLayout: "5.1", default: true }],
  subtitleTracks: []
} satisfies MediaTechnicalInfo;

test("faz remux quando somente contêiner e áudio são incompatíveis", () => {
  const plan = createPlaybackPlan(media, info, { capabilities: { videoCodecs: ["h264"], audioCodecs: ["aac"] }, quality: "original" });
  assert.equal(plan.mode, "remux");
});

test("transcodifica HDR quando a tela não oferece HDR", () => {
  const plan = createPlaybackPlan(media, { ...info, video: { ...info.video!, codec: "hevc", hdr: true } }, {
    capabilities: { videoCodecs: ["hevc"], supportsHdr: false }, quality: "original"
  });
  assert.equal(plan.mode, "transcode");
  assert.equal(plan.toneMap, true);
});
