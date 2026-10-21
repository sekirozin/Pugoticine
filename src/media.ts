import fs from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";

export function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export function streamFile(file: string, rangeHeader: string | undefined, res: ServerResponse): void {
  const stat = fs.statSync(file);
  const range = parseByteRange(rangeHeader, stat.size);
  const contentType = path.extname(file).toLowerCase() === ".webm" ? "video/webm" : "video/mp4";
  if (!range) {
    res.writeHead(200, { "content-type": contentType, "content-length": stat.size, "accept-ranges": "bytes" });
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(206, {
    "content-type": contentType,
    "content-length": range.end - range.start + 1,
    "content-range": `bytes ${range.start}-${range.end}/${stat.size}`,
    "accept-ranges": "bytes"
  });
  fs.createReadStream(file, range).pipe(res);
}

export function subtitleToVtt(file: string): string {
  const content = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r/g, "");
  if (path.extname(file).toLowerCase() === ".vtt") return content.startsWith("WEBVTT") ? content : `WEBVTT\n\n${content}`;
  return `WEBVTT\n\n${content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}
