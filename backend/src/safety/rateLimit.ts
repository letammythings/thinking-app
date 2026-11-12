import type { Db } from "../db/index.js";
import { many, run } from "../db/index.js";
import { nowIso } from "../util/crypto.js";

const memory = new Map<string, number[]>();

export function hitMemory(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const arr = (memory.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  memory.set(key, arr);
  return arr.length > max;
}

export function countSince(db: Db, userId: string, action: string, sinceIso: string): number {
  const rows = many<{ c: number }>(
    db,
    "SELECT COUNT(*) as c FROM rate_limit_events WHERE user_id = ? AND action = ? AND created_at >= ?",
    userId,
    action,
    sinceIso,
  );
  return rows[0]?.c ?? 0;
}

export function recordAction(db: Db, userId: string, action: string): void {
  run(
    db,
    "INSERT INTO rate_limit_events (id, user_id, action, created_at) VALUES (?, ?, ?, ?)",
    crypto.randomUUID(),
    userId,
    action,
    nowIso(),
  );
}

export function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600000).toISOString();
}
