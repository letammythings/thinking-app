import type { FastifyRequest } from "fastify";
import type { Db } from "../db/index.js";
import { many, one, publicIdentity, run } from "../db/index.js";
import { sha256, nowIso } from "../util/crypto.js";
import { fail } from "./errors.js";
import { emitToUser } from "../realtime/hub.js";

export type UserRow = {
  id: string;
  email: string | null;
  role: string;
  status: string;
  trust_score: number;
  onboarding_completed: number;
  created_at: string;
  birth_date: string | null;
  age_confirmed: number;
  deleted_at: string | null;
  password_hash: string | null;
};

export type IdentityRow = {
  id: string;
  user_id: string;
  display_name: string;
  persona_card: string | null;
  country_code: string | null;
  region: string | null;
  age_range: string | null;
  languages: string | null;
};

export type Authed = {
  user: UserRow;
  identity: IdentityRow | undefined;
  token: string;
};

export function bearerToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = (req as FastifyRequest & { cookies?: Record<string, string> }).cookies?.thinking;
  return cookie || undefined;
}

export function loadSession(db: Db, token: string): Authed | null {
  const session = one<{ user_id: string; revoked_at: string | null; expires_at: string }>(
    db,
    "SELECT user_id, revoked_at, expires_at FROM sessions WHERE token_hash = ?",
    sha256(token),
  );
  if (!session || session.revoked_at || session.expires_at < nowIso()) return null;
  const user = one<UserRow>(db, "SELECT * FROM users WHERE id = ?", session.user_id);
  if (!user || user.deleted_at) return null;
  if (user.status === "banned" || user.status === "suspended") return null;
  const identity = one<IdentityRow>(
    db,
    "SELECT * FROM identities WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
    user.id,
  );
  run(db, "UPDATE users SET last_seen_at = ? WHERE id = ?", nowIso(), user.id);
  return { user, identity, token };
}

export function requireUser(db: Db, req: FastifyRequest): Authed {
  const token = bearerToken(req);
  if (!token) fail(401, "unauthenticated", "Please sign in.");
  const auth = loadSession(db, token);
  if (!auth) fail(401, "unauthenticated", "Please sign in.");
  if (auth.user.status === "restricted") {
    /* still allowed to read, write is gated elsewhere */
  }
  return auth;
}

export function requireIdentity(db: Db, req: FastifyRequest): Authed & { identity: IdentityRow } {
  const auth = requireUser(db, req);
  if (!auth.identity) fail(403, "onboarding_required", "Create your identity first.");
  return auth as Authed & { identity: IdentityRow };
}

export function requireAdmin(db: Db, req: FastifyRequest): Authed {
  const auth = requireUser(db, req);
  if (auth.user.role !== "admin" && auth.user.role !== "moderator") {
    fail(403, "forbidden", "Admin access required.");
  }
  return auth;
}

export function blockedPair(db: Db, a: string, b: string): boolean {
  const row = one(
    db,
    `SELECT 1 as ok FROM blocks
     WHERE (blocker_user_id = ? AND blocked_user_id = ?)
        OR (blocker_user_id = ? AND blocked_user_id = ?)`,
    a,
    b,
    b,
    a,
  );
  return Boolean(row);
}

export function userIdForIdentity(db: Db, identityId: string): string | undefined {
  return one<{ user_id: string }>(db, "SELECT user_id FROM identities WHERE id = ?", identityId)?.user_id;
}

export function notify(
  db: Db,
  userId: string,
  type: string,
  title: string,
  body: string,
  payload: Record<string, unknown> = {},
): void {
  const prefs = one<Record<string, number>>(
    db,
    "SELECT * FROM notification_preferences WHERE user_id = ?",
    userId,
  );
  const map: Record<string, string> = {
    reply: "replies",
    answer: "answers",
    conversation: "conversations",
    voice: "voice",
    safety: "safety",
    moderation: "moderation",
  };
  const prefKey = map[type];
  if (prefs && prefKey && prefs[prefKey] === 0) return;
  const id = crypto.randomUUID();
  run(
    db,
    `INSERT INTO notifications (id, user_id, type, title, body, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    type,
    title,
    body,
    JSON.stringify(payload),
    nowIso(),
  );
  emitToUser(userId, "notification.created", { id, type, title, body, payload });
}

export function audit(
  db: Db,
  actorUserId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata?: unknown,
): void {
  run(
    db,
    `INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    actorUserId,
    action,
    targetType ?? null,
    targetId ?? null,
    metadata ? JSON.stringify(metadata) : null,
    nowIso(),
  );
}

export function track(db: Db, userId: string | null, name: string, properties?: unknown): void {
  run(
    db,
    "INSERT INTO analytics_events (id, user_id, name, properties, created_at) VALUES (?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    userId,
    name,
    properties ? JSON.stringify(properties) : null,
    nowIso(),
  );
}

export function identityPublic(row: {
  id: string;
  display_name: string;
  persona_card: string | null;
  country_code: string | null;
  region: string | null;
  age_range: string | null;
  languages: string | null;
}) {
  return publicIdentity(row);
}

export function hiddenFrom(db: Db, viewerUserId: string, authorIdentityId: string | null): boolean {
  if (!authorIdentityId) return false;
  const authorUser = userIdForIdentity(db, authorIdentityId);
  if (!authorUser) return false;
  return blockedPair(db, viewerUserId, authorUser);
}

export function otherMember(db: Db, conversationId: string, userId: string) {
  return one<{ identity_id: string; user_id: string }>(
    db,
    "SELECT identity_id, user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?",
    conversationId,
    userId,
  );
}

export function membership(db: Db, conversationId: string, userId: string) {
  return one<{ identity_id: string; user_id: string; muted: number }>(
    db,
    "SELECT identity_id, user_id, muted FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
    conversationId,
    userId,
  );
}

export function conversationPeerIdentity(db: Db, conversationId: string, userId: string) {
  const other = otherMember(db, conversationId, userId);
  if (!other) return null;
  const ident = one<IdentityRow>(db, "SELECT * FROM identities WHERE id = ?", other.identity_id);
  return ident ? identityPublic(ident) : null;
}

export { many, one, run };
