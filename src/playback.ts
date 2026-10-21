import type { MediaItem, MediaTechnicalInfo, PlaybackCapabilities, PlaybackPlan, PlaybackRequest } from "./types.js";

const defaults: PlaybackCapabilities = {
  videoCodecs: ["h264"], audioCodecs: ["aac", "mp3"], supportsHls: true,
  supportsHdr: false, maxHeight: 1080, downlinkMbps: 20
};

function targetHeight(request: PlaybackRequest, capabilities: PlaybackCapabilities, sourceHeight: number): number | null {
  if (request.quality === "original") return null;
  if (request.quality && request.quality !== "auto") return Math.min(sourceHeight, Number(request.quality));
  const networkLimit = capabilities.downlinkMbps > 0 && capabilities.downlinkMbps < 5 ? 480
    : capabilities.downlinkMbps > 0 && capabilities.downlinkMbps < 10 ? 720 : 1080;
  const target = Math.min(sourceHeight, capabilities.maxHeight || 1080, networkLimit);
  return target < sourceHeight ? target : null;
}

export function createPlaybackPlan(media: MediaItem, info: MediaTechnicalInfo, request: PlaybackRequest): PlaybackPlan {
  const capabilities: PlaybackCapabilities = { ...defaults, ...request.capabilities };
  const video = info.video;
  if (!video) throw new Error("O arquivo não possui uma faixa de vídeo válida.");
  const selectedAudio = info.audioTracks.find((track) => track.streamIndex === request.audioStreamIndex)
    ?? info.audioTracks.find((track) => track.default) ?? info.audioTracks[0];
  const selectedSubtitle = info.subtitleTracks.find((track) => track.streamIndex === request.subtitleStreamIndex);
  const height = targetHeight(request, capabilities, video.height);
  const toneMap = video.hdr && !capabilities.supportsHdr;
  const videoSupported = capabilities.videoCodecs.includes(video.codec);
  const audioSupported = !selectedAudio || capabilities.audioCodecs.includes(selectedAudio.codec);
  const directContainer = [".mp4", ".m4v", ".webm"].includes(media.extension);
  const selectingTracks = request.audioStreamIndex !== undefined && request.audioStreamIndex !== null
    || request.subtitleStreamIndex !== undefined && request.subtitleStreamIndex !== null;

  if (directContainer && videoSupported && audioSupported && !height && !toneMap && !selectingTracks) {
    return { mode: "direct", reason: "contêiner e codecs compatíveis", targetHeight: null, toneMap: false,
      audioStreamIndex: selectedAudio?.streamIndex ?? null, subtitleStreamIndex: null };
  }
  if (videoSupported && !height && !toneMap && selectedSubtitle?.kind !== "bitmap") {
    return { mode: "remux", reason: audioSupported ? "ajuste de contêiner" : "conversão de áudio",
      targetHeight: null, toneMap: false, audioStreamIndex: selectedAudio?.streamIndex ?? null,
      subtitleStreamIndex: selectedSubtitle?.streamIndex ?? null };
  }
  return { mode: "transcode", reason: toneMap ? "conversão HDR para SDR" : height ? "ajuste de qualidade" : "codec incompatível",
    targetHeight: height, toneMap, audioStreamIndex: selectedAudio?.streamIndex ?? null,
    subtitleStreamIndex: selectedSubtitle?.streamIndex ?? null };
}
