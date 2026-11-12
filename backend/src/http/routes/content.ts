import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../config.js";
import type { Db } from "../../db/index.js";
import { addDays, nowIso, randomToken } from "../../util/crypto.js";
import { moderateText, shouldAutoSuspend } from "../../safety/moderation.js";
import { fail } from "../errors.js";
import {
  hiddenFrom,
  identityPublic,
  many,
  notify,
  one,
  requireIdentity,
  requireUser,
  run,
  track,
  type IdentityRow,
} from "../context.js";
import { adjustTrust, voiceMaxSeconds } from "../../safety/trust.js";

function serializeQuestion(row: Record<string, unknown>, extras: Record<string, unknown> = {}) {
  return {
    id: row.id,
    prompt: row.prompt,
    kind: row.kind,
    categoryId: row.category_id,
    featured: Boolean(row.is_featured),
    createdAt: row.created_at,
    ...extras,
  };
}

function applyModeration(db: Db, userId: string, text: string, contentType: string, contentId: string) {
  const result = moderateText(text);
  run(
    db,
    `INSERT INTO moderation_events (id, user_id, content_type, content_id, source, severity, labels, action, created_at)
     VALUES (?, ?, ?, ?, 'automated', ?, ?, ?, ?)`,
    crypto.randomUUID(),
    userId,
    contentType,
    contentId,
    result.level,
    JSON.stringify(result.labels),
    result.action,
    nowIso(),
  );
  if (result.level === "orange" || result.level === "red") {
    adjustTrust(db, userId, "moderation_" + result.level, result.level === "red" ? -15 : -8);
  }
  if (shouldAutoSuspend(result)) {
    run(db, "UPDATE users SET status = 'suspended', updated_at = ? WHERE id = ?", nowIso(), userId);
    notify(db, userId, "moderation", "Account paused for review", "A message was flagged as a serious safety issue. A person will review it.");
  }
  return result;
}

export function registerContent(app: FastifyInstance, db: Db): void {
  app.get("/v1/categories", async () => ({
    categories: many(db, "SELECT id, slug, name, kind FROM categories ORDER BY sort_order"),
  }));
  app.get("/v1/interests", async () => ({
    interests: many(db, "SELECT slug, name FROM interests ORDER BY sort_order"),
  }));
  app.get("/v1/reference/countries", async () => ({
    countries: many(db, "SELECT code, name, region FROM countries ORDER BY name"),
  }));
  app.get("/v1/reference/languages", async () => ({
    languages: many(db, "SELECT code, name FROM languages ORDER BY name"),
  }));

  app.get("/v1/home", async (req) => {
    const auth = requireUser(db, req);
    const today = nowIso().slice(0, 10);
    const qotd =
      one<Record<string, unknown>>(
        db,
        "SELECT * FROM questions WHERE status = 'published' AND featured_on = ? LIMIT 1",
        today,
      ) ||
      one<Record<string, unknown>>(
        db,
        "SELECT * FROM questions WHERE status = 'published' AND is_featured = 1 ORDER BY created_at DESC LIMIT 1",
      );
    const waiting = many<Record<string, unknown>>(
      db,
      `SELECT q.*, COALESCE(a.c, 0) as answer_count
       FROM questions q
       LEFT JOIN (SELECT question_id, COUNT(*) c FROM answers WHERE status = 'published' GROUP BY question_id) a
         ON a.question_id = q.id
       WHERE q.status = 'published'
       ORDER BY answer_count ASC, q.created_at DESC
       LIMIT 6`,
    );
    const answers = many<Record<string, unknown>>(
      db,
      `SELECT a.*, i.display_name, i.persona_card, i.country_code, i.region, i.age_range, i.languages, i.id as identity_id, q.prompt
       FROM answers a
       JOIN identities i ON i.id = a.author_identity_id
       JOIN questions q ON q.id = a.question_id
       WHERE a.status = 'published'
       ORDER BY a.created_at DESC
       LIMIT 8`,
    );
    const notes = many<Record<string, unknown>>(
      db,
      `SELECT n.*, i.display_name, i.persona_card, i.country_code, i.region, i.age_range, i.languages, i.id as identity_id
       FROM notes n
       LEFT JOIN identities i ON i.id = n.author_identity_id
       WHERE n.status = 'published'
       ORDER BY n.created_at DESC
       LIMIT 6`,
    );
    const culture = many<Record<string, unknown>>(
      db,
      "SELECT * FROM questions WHERE status = 'published' AND kind = 'culture' ORDER BY created_at DESC LIMIT 5",
    );
    const advice = many<Record<string, unknown>>(
      db,
      `SELECT p.*, i.display_name, i.id as identity_id
       FROM advice_posts p
       JOIN identities i ON i.id = p.author_identity_id
       WHERE p.status = 'published'
       ORDER BY p.created_at DESC
       LIMIT 5`,
    );
    const matches = many<IdentityRow>(
      db,
      `SELECT i.* FROM identities i
       WHERE i.is_active = 1 AND i.user_id != ?
         AND i.user_id NOT IN (
           SELECT blocked_user_id FROM blocks WHERE blocker_user_id = ?
           UNION
           SELECT blocker_user_id FROM blocks WHERE blocked_user_id = ?
         )
       ORDER BY i.created_at DESC
       LIMIT 5`,
      auth.user.id,
      auth.user.id,
      auth.user.id,
    );
    return {
      questionOfTheDay: qotd ? serializeQuestion(qotd) : null,
      waiting: waiting.map((q) => serializeQuestion(q, { answerCount: q.answer_count })),
      answers: answers
        .filter((a) => !hiddenFrom(db, auth.user.id, String(a.author_identity_id)))
        .map((a) => ({
          id: a.id,
          body: a.body,
          voiceId: a.voice_id,
          createdAt: a.created_at,
          prompt: a.prompt,
          questionId: a.question_id,
          author: identityPublic({
            id: String(a.identity_id),
            display_name: String(a.display_name),
            persona_card: (a.persona_card as string | null) ?? null,
            country_code: (a.country_code as string | null) ?? null,
            region: (a.region as string | null) ?? null,
            age_range: (a.age_range as string | null) ?? null,
            languages: (a.languages as string | null) ?? null,
          }),
        })),
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        kind: n.kind,
        createdAt: n.created_at,
        repliesAllowed: Boolean(n.replies_allowed),
        conversationAllowed: Boolean(n.conversation_allowed),
        author: n.identity_id
          ? identityPublic({
              id: String(n.identity_id),
              display_name: String(n.display_name ?? "Editorial"),
              persona_card: (n.persona_card as string | null) ?? null,
              country_code: (n.country_code as string | null) ?? null,
              region: (n.region as string | null) ?? null,
              age_range: (n.age_range as string | null) ?? null,
              languages: (n.languages as string | null) ?? null,
            })
          : { id: "editorial", displayName: "Thinking", personaCard: ["A note left for you"], countryCode: null, region: null, ageRange: null, languages: [] },
      })),
      culture: culture.map((q) => serializeQuestion(q)),
      advice: advice.filter((p) => !hiddenFrom(db, auth.user.id, String(p.author_identity_id))),
      people: matches.map(identityPublic),
    };
  });

  app.get("/v1/search", async (req) => {
    requireUser(db, req);
    const q = String((req.query as { q?: string }).q ?? "").trim();
    if (q.length < 2) return { questions: [], notes: [], advice: [] };
    const like = `%${q.replace(/%/g, "")}%`;
    return {
      questions: many(db, "SELECT id, prompt, kind FROM questions WHERE status = 'published' AND prompt LIKE ? LIMIT 12", like),
      notes: many(db, "SELECT id, body, kind FROM notes WHERE status = 'published' AND body LIKE ? LIMIT 8", like),
      advice: many(db, "SELECT id, prompt FROM advice_posts WHERE status = 'published' AND (prompt LIKE ? OR body LIKE ?) LIMIT 8", like, like),
    };
  });

  app.get("/v1/questions", async (req) => {
    const auth = requireUser(db, req);
    const query = req.query as { category?: string; kind?: string; saved?: string };
    let sql = "SELECT q.* FROM questions q WHERE q.status = 'published'";
    const params: Array<string | number> = [];
    if (query.category) {
      sql += " AND q.category_id = ?";
      params.push(query.category);
    }
    if (query.kind) {
      sql += " AND q.kind = ?";
      params.push(query.kind);
    }
    if (query.saved === "1") {
      sql += " AND q.id IN (SELECT question_id FROM saved_questions WHERE user_id = ?)";
      params.push(auth.user.id);
    }
    sql += " ORDER BY q.created_at DESC LIMIT 40";
    const rows = many<Record<string, unknown>>(db, sql, ...params);
    const saved = new Set(
      many<{ question_id: string }>(db, "SELECT question_id FROM saved_questions WHERE user_id = ?", auth.user.id).map(
        (r) => r.question_id,
      ),
    );
    return { questions: rows.map((r) => serializeQuestion(r, { saved: saved.has(String(r.id)) })) };
  });

  app.post("/v1/questions", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z
      .object({
        prompt: z.string().min(12).max(280),
        categoryId: z.string().optional(),
        kind: z.enum(["general", "culture", "advice", "daily", "deep", "random", "hypothetical"]).optional(),
      })
      .parse(req.body);
    const mod = applyModeration(db, auth.user.id, body.prompt, "question", "pending");
    if (mod.level === "red" || mod.level === "orange") fail(400, "not_allowed", "That question couldn’t be published.");
    const id = crypto.randomUUID();
    run(
      db,
      `INSERT INTO questions (id, author_identity_id, category_id, prompt, kind, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'published', ?)`,
      id,
      auth.identity.id,
      body.categoryId ?? "life",
      body.prompt,
      body.kind ?? "general",
      nowIso(),
    );
    track(db, auth.user.id, "question_created", {});
    return { question: serializeQuestion(one(db, "SELECT * FROM questions WHERE id = ?", id) as Record<string, unknown>) };
  });

  app.get("/v1/questions/:id", async (req) => {
    requireUser(db, req);
    const id = (req.params as { id: string }).id;
    const q = one<Record<string, unknown>>(db, "SELECT * FROM questions WHERE id = ? AND status = 'published'", id);
    if (!q) fail(404, "not_found", "Question not found.");
    return { question: serializeQuestion(q) };
  });

  app.post("/v1/questions/:id/save", async (req) => {
    const auth = requireUser(db, req);
    run(
      db,
      "INSERT OR IGNORE INTO saved_questions (user_id, question_id, created_at) VALUES (?, ?, ?)",
      auth.user.id,
      (req.params as { id: string }).id,
      nowIso(),
    );
    return { ok: true };
  });

  app.delete("/v1/questions/:id/save", async (req) => {
    const auth = requireUser(db, req);
    run(db, "DELETE FROM saved_questions WHERE user_id = ? AND question_id = ?", auth.user.id, (req.params as { id: string }).id);
    return { ok: true };
  });

  app.get("/v1/questions/:id/answers", async (req) => {
    const auth = requireUser(db, req);
    const id = (req.params as { id: string }).id;
    const rows = many<Record<string, unknown>>(
      db,
      `SELECT a.*, i.display_name, i.persona_card, i.country_code, i.region, i.age_range, i.languages, i.id as identity_id
       FROM answers a JOIN identities i ON i.id = a.author_identity_id
       WHERE a.question_id = ? AND a.status = 'published' ORDER BY a.created_at DESC`,
      id,
    );
    return {
      answers: rows
        .filter((a) => !hiddenFrom(db, auth.user.id, String(a.author_identity_id)))
        .map((a) => ({
          id: a.id,
          body: a.body,
          voiceId: a.voice_id,
          createdAt: a.created_at,
          author: identityPublic({
            id: String(a.identity_id),
            display_name: String(a.display_name),
            persona_card: a.persona_card as string | null,
            country_code: a.country_code as string | null,
            region: a.region as string | null,
            age_range: a.age_range as string | null,
            languages: a.languages as string | null,
          }),
        })),
    };
  });

  app.post("/v1/questions/:id/answers", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z.object({ body: z.string().max(2000).optional(), voiceId: z.string().optional() }).parse(req.body);
    if (!body.body && !body.voiceId) fail(400, "empty", "Write something or attach a voice note.");
    if (body.body) {
      const mod = applyModeration(db, auth.user.id, body.body, "answer", "pending");
      if (mod.action === "hide" || mod.action === "hold" || mod.action === "suspend_pending_review") {
        fail(400, "not_allowed", "That answer couldn’t be published.");
      }
    }
    const id = crypto.randomUUID();
    run(
      db,
      `INSERT INTO answers (id, question_id, author_identity_id, body, voice_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'published', ?)`,
      id,
      (req.params as { id: string }).id,
      auth.identity.id,
      body.body ?? null,
      body.voiceId ?? null,
      nowIso(),
    );
    adjustTrust(db, auth.user.id, "answered_question", 1);
    track(db, auth.user.id, "question_answered", {});
    const q = one<{ author_identity_id: string | null; prompt: string }>(
      db,
      "SELECT author_identity_id, prompt FROM questions WHERE id = ?",
      (req.params as { id: string }).id,
    );
    if (q?.author_identity_id) {
      const owner = one<{ user_id: string }>(db, "SELECT user_id FROM identities WHERE id = ?", q.author_identity_id);
      if (owner && owner.user_id !== auth.user.id) {
        notify(db, owner.user_id, "answer", "Someone answered your question", q.prompt, { questionId: (req.params as { id: string }).id });
      }
    }
    return { id };
  });

  app.post("/v1/answers/:id/replies", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z.object({ body: z.string().min(1).max(800), voiceId: z.string().optional() }).parse(req.body);
    const answer = one<{ id: string; author_identity_id: string }>(db, "SELECT id, author_identity_id FROM answers WHERE id = ?", (req.params as { id: string }).id);
    if (!answer) fail(404, "not_found", "Answer not found.");
    const mod = applyModeration(db, auth.user.id, body.body, "reply", answer.id);
    if (mod.level === "red") fail(400, "not_allowed", "That reply couldn’t be published.");
    const id = crypto.randomUUID();
    run(
      db,
      "INSERT INTO answer_replies (id, answer_id, author_identity_id, body, voice_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      answer.id,
      auth.identity.id,
      body.body,
      body.voiceId ?? null,
      nowIso(),
    );
    const owner = one<{ user_id: string }>(db, "SELECT user_id FROM identities WHERE id = ?", answer.author_identity_id);
    if (owner && owner.user_id !== auth.user.id) {
      notify(db, owner.user_id, "reply", "Someone replied to your answer", body.body.slice(0, 80), { answerId: answer.id });
    }
    return { id };
  });

  app.get("/v1/notes", async (req) => {
    const auth = requireUser(db, req);
    const rows = many<Record<string, unknown>>(
      db,
      `SELECT n.*, i.display_name, i.persona_card, i.country_code, i.region, i.age_range, i.languages, i.id as identity_id
       FROM notes n LEFT JOIN identities i ON i.id = n.author_identity_id
       WHERE n.status = 'published' ORDER BY n.created_at DESC LIMIT 40`,
    );
    return {
      notes: rows
        .filter((n) => !n.author_identity_id || !hiddenFrom(db, auth.user.id, String(n.author_identity_id)))
        .map((n) => ({
          id: n.id,
          body: n.body,
          kind: n.kind,
          createdAt: n.created_at,
          repliesAllowed: Boolean(n.replies_allowed),
          conversationAllowed: Boolean(n.conversation_allowed),
          author: n.identity_id
            ? identityPublic({
                id: String(n.identity_id),
                display_name: String(n.display_name),
                persona_card: n.persona_card as string | null,
                country_code: n.country_code as string | null,
                region: n.region as string | null,
                age_range: n.age_range as string | null,
                languages: n.languages as string | null,
              })
            : { id: "editorial", displayName: "Thinking", personaCard: [], countryCode: null, region: null, ageRange: null, languages: [] },
        })),
    };
  });

  app.post("/v1/notes", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z
      .object({
        body: z.string().min(8).max(500),
        kind: z.enum(["thought", "quote", "lesson", "observation"]).default("thought"),
        repliesAllowed: z.boolean().default(true),
        conversationAllowed: z.boolean().default(true),
      })
      .parse(req.body);
    const mod = applyModeration(db, auth.user.id, body.body, "note", "pending");
    if (mod.level === "orange" || mod.level === "red") fail(400, "not_allowed", "That note couldn’t be published.");
    const id = crypto.randomUUID();
    run(
      db,
      `INSERT INTO notes (id, author_identity_id, body, kind, replies_allowed, conversation_allowed, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'published', ?)`,
      id,
      auth.identity.id,
      body.body,
      body.kind,
      Number(body.repliesAllowed),
      Number(body.conversationAllowed),
      nowIso(),
    );
    return { id };
  });

  app.post("/v1/notes/:id/replies", async (req) => {
    const auth = requireIdentity(db, req);
    const note = one<{ replies_allowed: number; author_identity_id: string | null }>(
      db,
      "SELECT replies_allowed, author_identity_id FROM notes WHERE id = ? AND status = 'published'",
      (req.params as { id: string }).id,
    );
    if (!note || !note.replies_allowed) fail(400, "closed", "Replies are not open on this note.");
    const body = z.object({ body: z.string().min(1).max(400) }).parse(req.body);
    run(
      db,
      "INSERT INTO note_replies (id, note_id, author_identity_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      (req.params as { id: string }).id,
      auth.identity.id,
      body.body,
      nowIso(),
    );
    if (note.author_identity_id) {
      const owner = one<{ user_id: string }>(db, "SELECT user_id FROM identities WHERE id = ?", note.author_identity_id);
      if (owner && owner.user_id !== auth.user.id) {
        notify(db, owner.user_id, "reply", "Someone replied to your note", body.body.slice(0, 80), {});
      }
    }
    return { ok: true };
  });

  app.post("/v1/notes/:id/react", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z.object({ reaction: z.enum(["seen", "felt", "curious"]) }).parse(req.body);
    run(
      db,
      `INSERT INTO note_reactions (note_id, identity_id, reaction, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(note_id, identity_id) DO UPDATE SET reaction = excluded.reaction`,
      (req.params as { id: string }).id,
      auth.identity.id,
      body.reaction,
      nowIso(),
    );
    return { ok: true };
  });

  app.get("/v1/advice", async (req) => {
    requireUser(db, req);
    const rows = many<Record<string, unknown>>(
      db,
      `SELECT p.*, i.display_name, i.id as identity_id FROM advice_posts p
       JOIN identities i ON i.id = p.author_identity_id
       WHERE p.status = 'published' ORDER BY p.created_at DESC LIMIT 40`,
    );
    return {
      posts: rows.map((p) => ({
        id: p.id,
        prompt: p.prompt,
        body: p.body,
        createdAt: p.created_at,
        author: { id: p.identity_id, displayName: p.display_name },
      })),
    };
  });

  app.post("/v1/advice", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z.object({ prompt: z.string().min(12).max(240), body: z.string().max(2000).optional() }).parse(req.body);
    const id = crypto.randomUUID();
    run(
      db,
      `INSERT INTO advice_posts (id, author_identity_id, prompt, body, category_id, status, created_at)
       VALUES (?, ?, ?, ?, 'advice', 'published', ?)`,
      id,
      auth.identity.id,
      body.prompt,
      body.body ?? null,
      nowIso(),
    );
    return { id };
  });

  app.post("/v1/advice/:id/replies", async (req) => {
    const auth = requireIdentity(db, req);
    const body = z.object({ body: z.string().min(8).max(1200) }).parse(req.body);
    run(
      db,
      "INSERT INTO advice_replies (id, advice_id, author_identity_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      (req.params as { id: string }).id,
      auth.identity.id,
      body.body,
      nowIso(),
    );
    return { ok: true };
  });

  app.get("/v1/culture", async (req) => {
    requireUser(db, req);
    const questions = many(db, "SELECT * FROM questions WHERE status = 'published' AND kind = 'culture' ORDER BY created_at DESC");
    return { questions: questions.map((q) => serializeQuestion(q as Record<string, unknown>)) };
  });

  app.post("/v1/voice", async (req) => {
    const auth = requireIdentity(db, req);
    const file = await req.file();
    if (!file) fail(400, "empty", "Attach an audio file.");
    const buf = await file.toBuffer();
    if (buf.length > config.maxVoiceBytes) fail(400, "too_large", "That voice note is too large.");
    const durationMs = Number(file.fields?.durationMs && !Array.isArray(file.fields.durationMs) && "value" in file.fields.durationMs
      ? file.fields.durationMs.value
      : 0);
    const maxSec = voiceMaxSeconds(auth.user.trust_score);
    if (durationMs && durationMs / 1000 > maxSec) fail(400, "too_long", `Voice notes can be up to ${maxSec} seconds.`);
    const id = crypto.randomUUID();
    const year = String(new Date().getFullYear());
    const dir = resolve(config.mediaDir, year);
    mkdirSync(dir, { recursive: true });
    const ext = extname(file.filename || "") || ".m4a";
    const rel = `${year}/${id}${ext}`;
    writeFileSync(resolve(config.mediaDir, rel), buf);
    const expires = addDays(config.voiceRetentionDays);
    run(
      db,
      `INSERT INTO voice_assets (id, owner_user_id, path, duration_ms, mime, size_bytes, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
      id,
      auth.user.id,
      rel,
      durationMs || 0,
      file.mimetype,
      buf.length,
      nowIso(),
      expires,
    );
    track(db, auth.user.id, "voice_uploaded", {});
    return { id, durationMs: durationMs || 0, expiresAt: expires };
  });

  app.get("/v1/voice/:id", async (req) => {
    const auth = requireUser(db, req);
    const voice = one<{ id: string; duration_ms: number; expires_at: string; status: string }>(
      db,
      "SELECT id, duration_ms, expires_at, status FROM voice_assets WHERE id = ?",
      (req.params as { id: string }).id,
    );
    if (!voice) fail(404, "not_found", "Voice note not found.");
    const token = randomToken(24);
    run(
      db,
      "INSERT INTO media_tokens (token, voice_id, user_id, expires_at) VALUES (?, ?, ?, ?)",
      token,
      voice.id,
      auth.user.id,
      addDays(0.04),
    );
    return {
      id: voice.id,
      durationMs: voice.duration_ms,
      expiresAt: voice.expires_at,
      url: `/media/${token}`,
    };
  });

  app.get("/media/:token", async (req, reply) => {
    const token = (req.params as { token: string }).token;
    const row = one<{ voice_id: string; expires_at: string }>(
      db,
      "SELECT voice_id, expires_at FROM media_tokens WHERE token = ?",
      token,
    );
    if (!row || row.expires_at < nowIso()) fail(404, "not_found", "This audio link has expired.");
    const voice = one<{ path: string; mime: string }>(db, "SELECT path, mime FROM voice_assets WHERE id = ?", row.voice_id);
    if (!voice) fail(404, "not_found", "Voice note not found.");
    reply.header("Content-Type", voice.mime);
    return reply.send(createReadStream(resolve(config.mediaDir, voice.path)));
  });

  app.get("/v1/notifications", async (req) => {
    const auth = requireUser(db, req);
    const rows = many(db, "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", auth.user.id);
    return { notifications: rows };
  });

  app.post("/v1/notifications/read", async (req) => {
    const auth = requireUser(db, req);
    const body = z.object({ ids: z.array(z.string()).optional() }).parse(req.body ?? {});
    if (body.ids?.length) {
      for (const id of body.ids) {
        run(db, "UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?", nowIso(), id, auth.user.id);
      }
    } else {
      run(db, "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", nowIso(), auth.user.id);
    }
    return { ok: true };
  });

  app.post("/v1/push-tokens", async (req) => {
    const auth = requireUser(db, req);
    const body = z.object({ token: z.string().min(8), platform: z.enum(["ios", "web"]) }).parse(req.body);
    run(
      db,
      "INSERT INTO push_tokens (id, user_id, token, platform, created_at) VALUES (?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      auth.user.id,
      body.token,
      body.platform,
      nowIso(),
    );
    return { ok: true };
  });

  app.post("/v1/events", async (req) => {
    const auth = requireUser(db, req);
    const body = z.object({ name: z.string().max(64), properties: z.record(z.unknown()).optional() }).parse(req.body);
    track(db, auth.user.id, body.name, body.properties);
    return { ok: true };
  });
}
