import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { WatchProgress } from "./types.js";

export class Store {
  private readonly db: Database.Database;
  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS watch_progress (
        userId TEXT NOT NULL,
        mediaId TEXT NOT NULL,
        position REAL NOT NULL DEFAULT 0,
        duration REAL NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (userId, mediaId)
      )
    `);
  }
  listProgress(userId: string): WatchProgress[] {
    const rows = this.db.prepare("SELECT mediaId, position, duration, completed, updatedAt FROM watch_progress WHERE userId = ? ORDER BY updatedAt DESC").all(userId) as Array<Omit<WatchProgress, "completed"> & { completed: number }>;
    return rows.map((row) => ({ ...row, completed: Boolean(row.completed) }));
  }
  saveProgress(userId: string, mediaId: string, position: number, duration: number): WatchProgress {
    const safePosition = Math.max(0, Number.isFinite(position) ? position : 0);
    const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
    const completed = safeDuration > 0 && safePosition / safeDuration >= 0.9;
    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO watch_progress (userId, mediaId, position, duration, completed, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(userId, mediaId) DO UPDATE SET
        position = excluded.position, duration = excluded.duration,
        completed = excluded.completed, updatedAt = excluded.updatedAt
    `).run(userId, mediaId, safePosition, safeDuration, completed ? 1 : 0, updatedAt);
    return { mediaId, position: safePosition, duration: safeDuration, completed, updatedAt };
  }
}
