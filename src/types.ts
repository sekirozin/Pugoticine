export type PugotiProfile = {
  username: string;
  displayName: string;
  nickname: string;
  avatarUrl: string;
  role: "admin" | "user";
};

export type Subtitle = {
  id: string;
  label: string;
  language: "pt-BR" | "en" | "unknown";
  path: string;
};

export type MediaMetadata = {
  tmdbId: number | null;
  originalTitle: string;
  overview: string;
  studio: string;
  runtime: number | null;
  certification: string;
  genres: string[];
  posterUrl: string;
  backdropUrl: string;
  audienceScore: number | null;
  criticScore: number | null;
  criticSource: string;
};

export type MediaItem = {
  id: string;
  title: string;
  year: number | null;
  relativePath: string;
  absolutePath: string;
  fileName: string;
  extension: string;
  size: number;
  modifiedAt: string;
  playbackMode: "direct" | "hls";
  subtitles: Subtitle[];
  metadata?: MediaMetadata;
};

export type WatchProgress = {
  mediaId: string;
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: string;
};

export type VideoTrack = {
  streamIndex: number;
  codec: string;
  profile: string;
  width: number;
  height: number;
  bitrate: number;
  frameRate: number;
  hdr: boolean;
  colorTransfer: string;
};

export type AudioTrack = {
  streamIndex: number;
  relativeIndex: number;
  codec: string;
  language: string;
  title: string;
  channels: number;
  channelLayout: string;
  default: boolean;
};

export type EmbeddedSubtitleTrack = {
  streamIndex: number;
  relativeIndex: number;
  codec: string;
  language: string;
  title: string;
  kind: "text" | "bitmap";
  default: boolean;
  forced: boolean;
};

export type MediaTechnicalInfo = {
  container: string;
  duration: number;
  bitrate: number;
  video: VideoTrack | null;
  audioTracks: AudioTrack[];
  subtitleTracks: EmbeddedSubtitleTrack[];
};

export type PlaybackCapabilities = {
  videoCodecs: string[];
  audioCodecs: string[];
  supportsHls: boolean;
  supportsHdr: boolean;
  maxHeight: number;
  downlinkMbps: number;
};

export type PlaybackRequest = {
  capabilities?: Partial<PlaybackCapabilities>;
  quality?: "auto" | "original" | "1080" | "720" | "480";
  audioStreamIndex?: number | null;
  subtitleStreamIndex?: number | null;
};

export type PlaybackPlan = {
  mode: "direct" | "remux" | "transcode";
  reason: string;
  targetHeight: number | null;
  toneMap: boolean;
  audioStreamIndex: number | null;
  subtitleStreamIndex: number | null;
};
