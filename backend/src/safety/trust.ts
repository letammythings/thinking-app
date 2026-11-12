import type { Db } from "../db/index.js";
import { one, run } from "../db/index.js";
import { config } from "../config.js";
import { nowIso } from "../util/crypto.js";

export function adjustTrust(db: Db, userId: string, signal: string, delta: number): number {
  const row = one<{ trust_score: number }>(db, "SELECT trust_score FROM users WHERE id = ?", userId);
  const next = Math.max(0, Math.min(100, (row?.trust_score ?? 45) + delta));
  run(db, "UPDATE users SET trust_score = ?, updated_at = ? WHERE id = ?", next, nowIso(), userId);
  run(
    db,
    "INSERT INTO trust_events (id, user_id, signal, delta, created_at) VALUES (?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    userId,
    signal,
    delta,
    nowIso(),
  );
  return next;
}

export function messagingLimit(trust: number, accountAgeHours: number): number {
  if (trust < 25) return 2;
  if (accountAgeHours < 24 || trust < 50) return config.newAccountMessageLimit;
  if (trust < 70) return 30;
  return 80;
}

export function conversationLimit(trust: number, accountAgeHours: number): number {
  if (trust < 25) return 0;
  if (accountAgeHours < 24 || trust < 50) return config.newAccountConversationLimit;
  if (trust < 70) return 8;
  return 20;
}

export function canShareLinks(trust: number): boolean {
  return trust >= config.trustLinkThreshold;
}

export function voiceMaxSeconds(trust: number): number {
  return trust >= 55 ? config.maxVoiceSeconds : Math.min(60, config.maxVoiceSeconds);
}

export function accountAgeHours(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / 3600000;
}
