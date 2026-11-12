import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../../db/index.js";
import { REPORT_CATEGORIES } from "../../util/names.js";
import { nowIso } from "../../util/crypto.js";
import { adjustTrust } from "../../safety/trust.js";
import { fail } from "../errors.js";
import {
  identityPublic,
  many,
  notify,
  one,
  requireIdentity,
  requireUser,
  run,
  userIdForIdentity,
  type IdentityRow,
} from "../context.js";

function resolveTargetUser(db: Db, targetType: string, targetId: string): string | undefined {
  if (targetType === "account") return userIdForIdentity(db, targetId);
  if (targetType === "message") {
    const m = one<{ sender_identity_id: string | null }>(db, "SELECT sender_identity_id FROM messages WHERE id = ?", targetId);
    return m?.sender_identity_id ? userIdForIdentity(db, m.sender_identity_id) : undefined;
  }
  if (targetType === "voice") {
    return one<{ owner_user_id: string }>(db, "SELECT owner_user_id FROM voice_assets WHERE id = ?", targetId)?.owner_user_id;
  }
  if (targetType === "question") {
    const q = one<{ author_identity_id: string | null }>(db, "SELECT author_identity_id FROM questions WHERE id = ?", targetId);
    return q?.author_identity_id ? userIdForIdentity(db, q.author_identity_id) : undefined;
  }
  if (targetType === "answer") {
    const a = one<{ author_identity_id: string }>(db, "SELECT author_identity_id FROM answers WHERE id = ?", targetId);
    return a ? userIdForIdentity(db, a.author_identity_id) : undefined;
  }
  if (targetType === "note") {
    const n = one<{ author_identity_id: string | null }>(db, "SELECT author_identity_id FROM notes WHERE id = ?", targetId);
    return n?.author_identity_id ? userIdForIdentity(db, n.author_identity_id) : undefined;
  }
  return undefined;
}

export function registerSafety(app: FastifyInstance, db: Db): void {
  app.get("/v1/safety", async (req) => {
    const auth = requireUser(db, req);
    const reports = many(db, "SELECT id, target_type, category, status, created_at FROM reports WHERE reporter_user_id = ? ORDER BY created_at DESC LIMIT 20", auth.user.id);
    const blocks = many<{ blocked_user_id: string }>(db, "SELECT blocked_user_id FROM blocks WHERE blocker_user_id = ?", auth.user.id);
    const identities = blocks
      .map((b) => one<IdentityRow>(db, "SELECT * FROM identities WHERE user_id = ? AND is_active = 1 LIMIT 1", b.blocked_user_id))
      .filter(Boolean)
      .map((i) => identityPublic(i as IdentityRow));
    return {
      rules: [
        "Be curious, not cruel.",
        "No scams, money requests, or moving people off the app to extract anything.",
        "No threats, hate, or sexual pressure.",
        "Do not share someone else’s private information.",
        "You can leave a conversation at any time.",
      ],
      reports,
      blocked: identities,
    };
  });

  app.post("/v1/reports", async (req) => {
    const auth = requireUser(db, req);
    const body = z
      .object({
        targetType: z.enum(["message", "voice", "post", "question", "answer", "note", "account"]),
        targetId: z.string(),
        category: z.enum(REPORT_CATEGORIES),
        details: z.string().max(800).optional(),
      })
      .parse(req.body);
    const targetUser = resolveTargetUser(db, body.targetType === "post" ? "note" : body.targetType, body.targetId);
    const id = crypto.randomUUID();
    run(
      db,
      `INSERT INTO reports (id, reporter_user_id, target_type, target_id, target_user_id, category, details, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      id,
      auth.user.id,
      body.targetType,
      body.targetId,
      targetUser ?? null,
      body.category,
      body.details ?? null,
      nowIso(),
    );
    notify(db, auth.user.id, "safety", "Report received", "Thank you. A person can review this. You can also block them now.");
    return { id };
  });

  app.get("/v1/blocks", async (req) => {
    const auth = requireUser(db, req);
    const blocks = many<{ blocked_user_id: string }>(db, "SELECT blocked_user_id FROM blocks WHERE blocker_user_id = ?", auth.user.id);
    return {
      blocked: blocks
        .map((b) => one<IdentityRow>(db, "SELECT * FROM identities WHERE user_id = ? AND is_active = 1 LIMIT 1", b.blocked_user_id))
        .filter(Boolean)
        .map((i) => identityPublic(i as IdentityRow)),
    };
  });

  app.post("/v1/blocks", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z.object({ identityId: z.string() }).parse(req.body);
    const target = userIdForIdentity(db, body.identityId);
    if (!target || target === auth.user.id) fail(400, "invalid", "You cannot block that identity.");
    run(
      db,
      "INSERT OR IGNORE INTO blocks (blocker_user_id, blocked_user_id, created_at) VALUES (?, ?, ?)",
      auth.user.id,
      target,
      nowIso(),
    );
    run(
      db,
      `UPDATE conversations SET status = 'blocked', ended_at = ?
       WHERE id IN (
         SELECT cm.conversation_id FROM conversation_members cm
         JOIN conversation_members o ON o.conversation_id = cm.conversation_id AND o.user_id = ?
         WHERE cm.user_id = ?
       ) AND status IN ('pending', 'active')`,
      nowIso(),
      target,
      auth.user.id,
    );
    adjustTrust(db, target, "blocked_by_user", -2);
    return { ok: true };
  });

  app.delete("/v1/blocks/:identityId", async (req) => {
    const auth = requireUser(db, req);
    const target = userIdForIdentity(db, (req.params as { identityId: string }).identityId);
    if (target) run(db, "DELETE FROM blocks WHERE blocker_user_id = ? AND blocked_user_id = ?", auth.user.id, target);
    return { ok: true };
  });

  app.post("/v1/mutes", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z.object({ identityId: z.string() }).parse(req.body);
    run(
      db,
      "INSERT OR IGNORE INTO mutes (user_id, identity_id, created_at) VALUES (?, ?, ?)",
      auth.user.id,
      body.identityId,
      nowIso(),
    );
    return { ok: true };
  });

  app.post("/v1/restricts", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z.object({ identityId: z.string() }).parse(req.body);
    run(
      db,
      "INSERT OR IGNORE INTO restricts (user_id, identity_id, created_at) VALUES (?, ?, ?)",
      auth.user.id,
      body.identityId,
      nowIso(),
    );
    return { ok: true };
  });

  app.post("/v1/appeals", async (req) => {
    const auth = requireUser(db, req);
    const body = z.object({ moderationEventId: z.string(), reason: z.string().min(8).max(800) }).parse(req.body);
    run(
      db,
      "INSERT INTO appeals (id, user_id, moderation_event_id, reason, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)",
      crypto.randomUUID(),
      auth.user.id,
      body.moderationEventId,
      body.reason,
      nowIso(),
    );
    return { ok: true };
  });
}
