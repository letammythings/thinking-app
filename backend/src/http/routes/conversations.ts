import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../config.js";
import type { Db } from "../../db/index.js";
import { suggestWithOptionalLlm } from "../../ai/assistant.js";
import { INTENTS } from "../../util/names.js";
import { nowIso } from "../../util/crypto.js";
import { moderateText, shouldAutoSuspend } from "../../safety/moderation.js";
import { detectPii } from "../../safety/pii.js";
import { scoreScam } from "../../safety/scam.js";
import {
  accountAgeHours,
  adjustTrust,
  canShareLinks,
  conversationLimit,
  messagingLimit,
} from "../../safety/trust.js";
import { countSince, hoursAgo, recordAction } from "../../safety/rateLimit.js";
import { emitToUser } from "../../realtime/hub.js";
import { fail } from "../errors.js";
import {
  blockedPair,
  conversationPeerIdentity,
  identityPublic,
  many,
  membership,
  notify,
  one,
  otherMember,
  requireIdentity,
  run,
  track,
  userIdForIdentity,
} from "../context.js";

function linkBlocked(trust: number, text: string): boolean {
  return /https?:\/\//i.test(text) && !canShareLinks(trust);
}

function startConversation(
  db: Db,
  from: { userId: string; identityId: string },
  toIdentityId: string,
  opts: { originType: string; originId?: string; questionId?: string; intent: string; message?: string; autoAccept?: boolean },
) {
  const toUser = userIdForIdentity(db, toIdentityId);
  if (!toUser) fail(404, "not_found", "That person is no longer here.");
  if (toUser === from.userId) fail(400, "invalid", "You cannot start a conversation with yourself.");
  if (blockedPair(db, from.userId, toUser)) fail(403, "blocked", "You cannot contact this person.");
  const existing = one<{ conversation_id: string }>(
    db,
    `SELECT cm.conversation_id FROM conversation_members cm
     JOIN conversation_members other ON other.conversation_id = cm.conversation_id AND other.user_id = ?
     JOIN conversations c ON c.id = cm.conversation_id
     WHERE cm.user_id = ? AND c.status IN ('pending', 'active')
     LIMIT 1`,
    toUser,
    from.userId,
  );
  if (existing) return { conversationId: existing.conversation_id, existing: true };
  const user = one<{ trust_score: number; created_at: string }>(
    db,
    "SELECT trust_score, created_at FROM users WHERE id = ?",
    from.userId,
  )!;
  const limit = conversationLimit(user.trust_score, accountAgeHours(user.created_at));
  const used = countSince(db, from.userId, "converse", hoursAgo(24));
  if (used >= limit) fail(429, "rate_limited", "You can start more conversations as your account grows.");
  const restricted = one(
    db,
    "SELECT 1 as ok FROM restricts WHERE user_id = ? AND identity_id = ?",
    toUser,
    from.identityId,
  );
  if (restricted) fail(403, "restricted", "This person is not taking new conversations.");

  const id = crypto.randomUUID();
  const status = opts.autoAccept ? "active" : "pending";
  run(
    db,
    `INSERT INTO conversations (id, origin_type, origin_id, question_id, intent, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    opts.originType,
    opts.originId ?? null,
    opts.questionId ?? null,
    opts.intent,
    status,
    nowIso(),
  );
  run(
    db,
    "INSERT INTO conversation_members (conversation_id, identity_id, user_id, role) VALUES (?, ?, ?, 'requester')",
    id,
    from.identityId,
    from.userId,
  );
  run(
    db,
    "INSERT INTO conversation_members (conversation_id, identity_id, user_id, role) VALUES (?, ?, ?, 'recipient')",
    id,
    toIdentityId,
    toUser,
  );
  const requestId = crypto.randomUUID();
  run(
    db,
    `INSERT INTO conversation_requests (id, conversation_id, from_identity_id, to_identity_id, message, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    requestId,
    id,
    from.identityId,
    toIdentityId,
    opts.message ?? null,
    opts.autoAccept ? "accepted" : "pending",
    nowIso(),
  );
  if (opts.message) {
    run(
      db,
      `INSERT INTO messages (id, conversation_id, sender_identity_id, type, body, moderation_level, created_at)
       VALUES (?, ?, ?, 'text', ?, 'green', ?)`,
      crypto.randomUUID(),
      id,
      from.identityId,
      opts.message,
      nowIso(),
    );
  }
  recordAction(db, from.userId, "converse");
  notify(db, toUser, "conversation", "Someone would like to talk", opts.message || "A new conversation request", {
    conversationId: id,
  });
  emitToUser(toUser, "conversation.updated", { conversationId: id, status });
  track(db, from.userId, "conversation_started", { originType: opts.originType });
  return { conversationId: id, requestId, existing: false };
}

export function registerConversations(app: FastifyInstance, db: Db): void {
  app.post("/v1/answers/:id/converse", async (req) => {
    const auth = requireIdentity(db, req);
    const answer = one<{ author_identity_id: string; question_id: string }>(
      db,
      "SELECT author_identity_id, question_id FROM answers WHERE id = ?",
      (req.params as { id: string }).id,
    );
    if (!answer) fail(404, "not_found", "Answer not found.");
    const body = z
      .object({
        intent: z.enum(INTENTS),
        firstMessage: z.string().max(500).optional(),
      })
      .parse(req.body);
    return startConversation(db, { userId: auth.user.id, identityId: auth.identity.id }, answer.author_identity_id, {
      originType: "answer",
      originId: (req.params as { id: string }).id,
      questionId: answer.question_id,
      intent: body.intent,
      message: body.firstMessage,
    });
  });

  app.post("/v1/notes/:id/converse", async (req) => {
    const auth = requireIdentity(db, req);
    const note = one<{ author_identity_id: string | null; conversation_allowed: number }>(
      db,
      "SELECT author_identity_id, conversation_allowed FROM notes WHERE id = ?",
      (req.params as { id: string }).id,
    );
    if (!note?.author_identity_id || !note.conversation_allowed) fail(400, "closed", "This note is not open for conversation.");
    const body = z.object({ intent: z.enum(INTENTS), firstMessage: z.string().max(500).optional() }).parse(req.body);
    return startConversation(db, { userId: auth.user.id, identityId: auth.identity.id }, note.author_identity_id, {
      originType: "note",
      originId: (req.params as { id: string }).id,
      intent: body.intent,
      message: body.firstMessage,
    });
  });

  app.post("/v1/matches", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z.object({ identityId: z.string(), intent: z.enum(INTENTS), firstMessage: z.string().max(400).optional() }).parse(req.body);
    return startConversation(db, { userId: auth.user.id, identityId: auth.identity.id }, body.identityId, {
      originType: "match",
      intent: body.intent,
      message: body.firstMessage,
    });
  });

  app.get("/v1/conversations", async (req) => {
    const auth = requireIdentity(db, req);
    const rows = many<Record<string, unknown>>(
      db,
      `SELECT c.*, cm.last_read_at, cm.muted
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE cm.user_id = ?
       ORDER BY c.created_at DESC`,
      auth.user.id,
    );
    return {
      conversations: rows.map((c) => ({
        id: c.id,
        intent: c.intent,
        status: c.status,
        originType: c.origin_type,
        scamWarned: Boolean(c.scam_warned),
        createdAt: c.created_at,
        muted: Boolean(c.muted),
        peer: conversationPeerIdentity(db, String(c.id), auth.user.id),
        lastMessage: one(db, "SELECT type, body, created_at FROM messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1", String(c.id)),
      })),
    };
  });

  app.get("/v1/conversations/:id", async (req) => {
    const auth = requireIdentity(db, req);
    const id = (req.params as { id: string }).id;
    if (!membership(db, id, auth.user.id)) fail(404, "not_found", "Conversation not found.");
    const convo = one<Record<string, unknown>>(db, "SELECT * FROM conversations WHERE id = ?", id)!;
    const messages = many<Record<string, unknown>>(
      db,
      "SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 200",
      id,
    );
    return {
      conversation: {
        id: convo.id,
        intent: convo.intent,
        status: convo.status,
        originType: convo.origin_type,
        scamWarned: Boolean(convo.scam_warned),
        peer: conversationPeerIdentity(db, id, auth.user.id),
      },
      messages: messages.map((m) => ({
        id: m.id,
        type: m.type,
        body: m.body,
        voiceId: m.voice_id,
        senderIdentityId: m.sender_identity_id,
        mine: m.sender_identity_id === auth.identity.id,
        createdAt: m.created_at,
        moderationLevel: m.moderation_level,
      })),
    };
  });

  app.post("/v1/conversations/:id/messages", async (req) => {
    const auth = requireIdentity(db, req);
    const id = (req.params as { id: string }).id;
    const mine = membership(db, id, auth.user.id);
    if (!mine) fail(404, "not_found", "Conversation not found.");
    const convo = one<{ status: string; scam_warned: number }>(db, "SELECT status, scam_warned FROM conversations WHERE id = ?", id)!;
    if (convo.status === "ended" || convo.status === "blocked") fail(400, "closed", "This conversation has ended.");
    if (convo.status === "pending" && mine.identity_id) {
      /* requester can send first notes; recipient should accept */
    }
    const body = z
      .object({
        body: z.string().max(2000).optional(),
        voiceId: z.string().optional(),
        confirmPii: z.boolean().optional(),
        confirmScam: z.boolean().optional(),
      })
      .parse(req.body);
    if (!body.body && !body.voiceId) fail(400, "empty", "Write something or attach a voice note.");
    const text = body.body ?? "";
    if (linkBlocked(auth.user.trust_score, text)) {
      fail(403, "links_restricted", "New accounts cannot send links yet.");
    }
    const pii = text ? detectPii(text) : { warning: false, kinds: [] as string[] };
    if (pii.warning && !body.confirmPii) {
      fail(409, "pii_warning", "This looks like personal information. Only send it if you intend to.", {
        kinds: pii.kinds,
      });
    }
    const limit = messagingLimit(auth.user.trust_score, accountAgeHours(auth.user.created_at));
    if (countSince(db, auth.user.id, "message", hoursAgo(1)) >= limit) {
      fail(429, "rate_limited", "You’re sending messages quickly. Pause for a bit.");
    }

    let level = "green";
    if (text) {
      const mod = moderateText(text);
      level = mod.level;
      run(
        db,
        `INSERT INTO moderation_events (id, user_id, content_type, content_id, source, severity, labels, action, created_at)
         VALUES (?, ?, 'message', ?, 'automated', ?, ?, ?, ?)`,
        crypto.randomUUID(),
        auth.user.id,
        id,
        mod.level,
        JSON.stringify(mod.labels),
        mod.action,
        nowIso(),
      );
      if (mod.action === "hold" || mod.action === "hide" || mod.action === "suspend_pending_review") {
        if (shouldAutoSuspend(mod)) {
          run(db, "UPDATE users SET status = 'suspended', updated_at = ? WHERE id = ?", nowIso(), auth.user.id);
        }
        fail(400, "not_allowed", "That message could not be sent.");
      }
    }

    const recentBodies = many<{ body: string }>(
      db,
      "SELECT body FROM messages WHERE sender_identity_id = ? ORDER BY created_at DESC LIMIT 8",
      auth.identity.id,
    ).map((m) => m.body);
    const duplicate = Boolean(text && recentBodies.includes(text));
    const velocity = countSince(db, auth.user.id, "message", hoursAgo(1));
    const scam = text ? scoreScam(text, { duplicate, velocity }) : { warn: false, score: 0, labels: [] };
    if (scam.warn && !body.confirmScam && !convo.scam_warned) {
      run(db, "UPDATE conversations SET scam_warned = 1 WHERE id = ?", id);
      const peer = otherMember(db, id, auth.user.id);
      if (peer) emitToUser(peer.user_id, "scam.warning", { conversationId: id, labels: scam.labels });
      emitToUser(auth.user.id, "scam.warning", { conversationId: id, labels: scam.labels });
      fail(409, "scam_warning", "This conversation contains patterns commonly associated with scams. Never send money, passwords, verification codes, cryptocurrency, or banking information to someone you met here.", {
        labels: scam.labels,
        score: scam.score,
      });
    }

    const messageId = crypto.randomUUID();
    run(
      db,
      `INSERT INTO messages (id, conversation_id, sender_identity_id, type, body, voice_id, moderation_level, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      messageId,
      id,
      auth.identity.id,
      body.voiceId ? "voice" : "text",
      body.body ?? null,
      body.voiceId ?? null,
      level,
      nowIso(),
    );
    if (convo.status === "pending") {
      run(db, "UPDATE conversations SET status = 'active' WHERE id = ?", id);
    }
    recordAction(db, auth.user.id, "message");
    const peer = otherMember(db, id, auth.user.id);
    if (peer) {
      notify(
        db,
        peer.user_id,
        body.voiceId ? "voice" : "conversation",
        body.voiceId ? "New voice message" : "New message",
        body.body ? body.body.slice(0, 80) : "Voice message",
        { conversationId: id },
      );
      emitToUser(peer.user_id, "message.created", {
        conversationId: id,
        id: messageId,
        body: body.body,
        type: body.voiceId ? "voice" : "text",
        voiceId: body.voiceId,
      });
    }
    return { id: messageId };
  });

  app.post("/v1/conversations/:id/read", async (req) => {
    const auth = requireIdentity(db, req);
    run(
      db,
      "UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?",
      nowIso(),
      (req.params as { id: string }).id,
      auth.user.id,
    );
    return { ok: true };
  });

  app.post("/v1/conversations/:id/end", async (req) => {
    const auth = requireIdentity(db, req);
    const id = (req.params as { id: string }).id;
    if (!membership(db, id, auth.user.id)) fail(404, "not_found", "Conversation not found.");
    run(db, "UPDATE conversations SET status = 'ended', ended_at = ? WHERE id = ?", nowIso(), id);
    run(
      db,
      `INSERT INTO messages (id, conversation_id, type, body, moderation_level, created_at)
       VALUES (?, ?, 'system', 'This conversation ended. Thank you for talking.', 'green', ?)`,
      crypto.randomUUID(),
      id,
      nowIso(),
    );
    adjustTrust(db, auth.user.id, "conversation_completed", 3);
    const peer = otherMember(db, id, auth.user.id);
    if (peer) {
      adjustTrust(db, peer.user_id, "conversation_completed", 3);
      emitToUser(peer.user_id, "conversation.updated", { conversationId: id, status: "ended" });
    }
    track(db, auth.user.id, "conversation_ended", {});
    return { ok: true };
  });

  app.post("/v1/conversations/:id/mute", async (req) => {
    const auth = requireIdentity(db, req);
    run(
      db,
      "UPDATE conversation_members SET muted = 1 WHERE conversation_id = ? AND user_id = ?",
      (req.params as { id: string }).id,
      auth.user.id,
    );
    return { ok: true };
  });

  app.post("/v1/conversations/:id/assist", async (req) => {
    const auth = requireIdentity(db, req);
    const id = (req.params as { id: string }).id;
    if (!membership(db, id, auth.user.id)) fail(404, "not_found", "Conversation not found.");
    const convo = one<{ intent: string }>(db, "SELECT intent FROM conversations WHERE id = ?", id)!;
    const last = one<{ body: string }>(
      db,
      "SELECT body FROM messages WHERE conversation_id = ? AND type = 'text' AND body IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      id,
    );
    const suggestions = await suggestWithOptionalLlm(
      { lastMessage: last?.body ?? "", intent: convo.intent },
      config.openaiKey,
      config.openaiModel,
    );
    return { suggestions };
  });

  app.post("/v1/conversation-requests/:id/accept", async (req) => {
    const auth = requireIdentity(db, req);
    const row = one<{ conversation_id: string; to_identity_id: string; status: string }>(
      db,
      "SELECT * FROM conversation_requests WHERE id = ?",
      (req.params as { id: string }).id,
    );
    if (!row || row.to_identity_id !== auth.identity.id) fail(404, "not_found", "Request not found.");
    run(db, "UPDATE conversation_requests SET status = 'accepted' WHERE id = ?", row.conversation_id && (req.params as { id: string }).id);
    run(db, "UPDATE conversation_requests SET status = 'accepted' WHERE id = ?", (req.params as { id: string }).id);
    run(db, "UPDATE conversations SET status = 'active' WHERE id = ?", row.conversation_id);
    return { conversationId: row.conversation_id };
  });

  app.post("/v1/conversation-requests/:id/decline", async (req) => {
    const auth = requireIdentity(db, req);
    const row = one<{ conversation_id: string; to_identity_id: string }>(
      db,
      "SELECT * FROM conversation_requests WHERE id = ?",
      (req.params as { id: string }).id,
    );
    if (!row || row.to_identity_id !== auth.identity.id) fail(404, "not_found", "Request not found.");
    run(db, "UPDATE conversation_requests SET status = 'declined' WHERE id = ?", (req.params as { id: string }).id);
    run(db, "UPDATE conversations SET status = 'ended', ended_at = ? WHERE id = ?", nowIso(), row.conversation_id);
    return { ok: true };
  });
}
