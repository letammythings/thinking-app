import type { FastifyInstance } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { config } from "../../config.js";
import { createIdentity, type Db } from "../../db/index.js";
import {
  addDays,
  addMinutes,
  ageFromBirthDate,
  hashPassword,
  nowIso,
  randomToken,
  sha256,
  verifyPassword,
} from "../../util/crypto.js";
import { generateDisplayName } from "../../util/names.js";
import { fail } from "../errors.js";
import {
  identityPublic,
  requireUser,
  run,
  one,
  many,
  audit,
  track,
  type IdentityRow,
  type UserRow,
} from "../context.js";
import { hitMemory } from "../../safety/rateLimit.js";

const emailSchema = z.string().email().transform((e) => e.toLowerCase().trim());
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function sessionCookie(reply: { setCookie: Function }, token: string, days: number) {
  reply.setCookie("thinking", token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.env === "production",
    maxAge: days * 86400,
  });
}

function presentMe(db: Db, user: UserRow, identity?: IdentityRow) {
  const prefs = one(db, "SELECT * FROM notification_preferences WHERE user_id = ?", user.id);
  const interests = many<{ interest_slug: string }>(
    db,
    "SELECT interest_slug FROM user_interests WHERE user_id = ?",
    user.id,
  );
  return {
    account: {
      role: user.role,
      status: user.status,
      onboardingCompleted: Boolean(user.onboarding_completed),
      createdAt: user.created_at,
      hasEmail: Boolean(user.email),
    },
    identity: identity ? identityPublic(identity) : null,
    interests: interests.map((i) => i.interest_slug),
    notifications: prefs ?? {
      replies: 1,
      answers: 1,
      conversations: 1,
      voice: 1,
      safety: 1,
      moderation: 1,
    },
  };
}

async function issueSession(
  db: Db,
  userId: string,
  req: { headers: { "user-agent"?: string } },
): Promise<string> {
  const token = randomToken();
  run(
    db,
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    userId,
    sha256(token),
    req.headers["user-agent"] ?? null,
    nowIso(),
    addDays(config.sessionDays),
  );
  return token;
}

export function registerAuth(app: FastifyInstance, db: Db): void {
  app.post("/v1/auth/register", async (req, reply) => {
    if (config.env !== "test" && hitMemory(`reg:${req.ip}`, 60_000, 8)) fail(429, "rate_limited", "Please wait a moment.");
    const body = z
      .object({
        email: emailSchema,
        password: z.string().min(10).max(200),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ageConfirmed: z.literal(true),
      })
      .parse(req.body);
    const age = ageFromBirthDate(body.birthDate);
    if (age < 18) fail(403, "underage", "Thinking is for adults 18 and older.");
    const exists = one(db, "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL", body.email);
    if (exists) fail(409, "email_taken", "That email is already in use.");
    const id = crypto.randomUUID();
    const t = nowIso();
    run(
      db,
      `INSERT INTO users (id, email, password_hash, role, status, age_confirmed, birth_date, trust_score, onboarding_completed, created_at, updated_at)
       VALUES (?, ?, ?, 'user', 'active', 1, ?, 45, 0, ?, ?)`,
      id,
      body.email,
      await hashPassword(body.password),
      body.birthDate,
      t,
      t,
    );
    run(db, "INSERT INTO notification_preferences (user_id) VALUES (?)", id);
    const identity = createIdentity(db, id, generateDisplayName());
    const ident = one<IdentityRow>(db, "SELECT * FROM identities WHERE id = ?", identity.id)!;
    const token = await issueSession(db, id, req);
    sessionCookie(reply, token, config.sessionDays);
    track(db, id, "account_created", {});
    const user = one<UserRow>(db, "SELECT * FROM users WHERE id = ?", id)!;
    return { token, me: presentMe(db, user, ident) };
  });

  app.post("/v1/auth/login", async (req, reply) => {
    if (config.env !== "test" && hitMemory(`login:${req.ip}`, 60_000, 12)) fail(429, "rate_limited", "Please wait a moment.");
    const body = z.object({ email: emailSchema, password: z.string().min(1) }).parse(req.body);
    const user = one<UserRow>(
      db,
      "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL",
      body.email,
    );
    if (!user?.password_hash || !(await verifyPassword(body.password, user.password_hash))) {
      fail(401, "invalid_credentials", "Email or password is incorrect.");
    }
    if (user.status === "banned" || user.status === "suspended") {
      fail(403, "account_locked", "This account cannot sign in right now.");
    }
    const identity = one<IdentityRow>(
      db,
      "SELECT * FROM identities WHERE user_id = ? AND is_active = 1 LIMIT 1",
      user.id,
    );
    const token = await issueSession(db, user.id, req);
    sessionCookie(reply, token, config.sessionDays);
    track(db, user.id, "login", {});
    return { token, me: presentMe(db, user, identity) };
  });

  app.post("/v1/auth/apple", async (req, reply) => {
    const body = z.object({ identityToken: z.string().min(20) }).parse(req.body);
    let payload: { sub?: string; email?: string };
    try {
      const verified = await jwtVerify(body.identityToken, appleJwks, {
        issuer: "https://appleid.apple.com",
        audience: [config.appleBundleId, config.appleServiceId],
      });
      payload = verified.payload as { sub?: string; email?: string };
    } catch {
      fail(401, "invalid_apple_token", "Apple could not verify this sign-in.");
    }
    if (!payload.sub) fail(401, "invalid_apple_token", "Apple could not verify this sign-in.");
    let user = one<UserRow>(
      db,
      "SELECT * FROM users WHERE apple_sub = ? AND deleted_at IS NULL",
      payload.sub,
    );
    if (!user && payload.email) {
      user = one<UserRow>(
        db,
        "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL",
        payload.email.toLowerCase(),
      );
      if (user) {
        run(db, "UPDATE users SET apple_sub = ? WHERE id = ?", payload.sub, user.id);
      }
    }
    if (!user) {
      fail(400, "age_required", "Finish creating an account with your birth date first, then link Apple.");
    }
    const identity = one<IdentityRow>(
      db,
      "SELECT * FROM identities WHERE user_id = ? AND is_active = 1 LIMIT 1",
      user.id,
    );
    const token = await issueSession(db, user.id, req);
    sessionCookie(reply, token, config.sessionDays);
    return { token, me: presentMe(db, user, identity) };
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    const auth = requireUser(db, req);
    run(
      db,
      "UPDATE sessions SET revoked_at = ? WHERE token_hash = ?",
      nowIso(),
      sha256(auth.token),
    );
    reply.clearCookie("thinking", { path: "/" });
    return { ok: true };
  });

  app.post("/v1/auth/logout-all", async (req) => {
    const auth = requireUser(db, req);
    run(db, "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", nowIso(), auth.user.id);
    return { ok: true };
  });

  app.post("/v1/auth/forgot", async (req) => {
    const body = z.object({ email: emailSchema }).parse(req.body);
    const user = one<UserRow>(db, "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL", body.email);
    const generic = { ok: true, message: "If that account exists, a reset link was created." };
    if (!user) return generic;
    const token = randomToken();
    run(
      db,
      `INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      user.id,
      sha256(token),
      nowIso(),
      addMinutes(config.passwordResetMinutes),
    );
    if (config.env !== "production") return { ...generic, resetToken: token };
    return generic;
  });

  app.post("/v1/auth/reset", async (req) => {
    const body = z.object({ token: z.string(), password: z.string().min(10).max(200) }).parse(req.body);
    const row = one<{ user_id: string; expires_at: string; used_at: string | null; id: string }>(
      db,
      "SELECT * FROM password_resets WHERE token_hash = ?",
      sha256(body.token),
    );
    if (!row || row.used_at || row.expires_at < nowIso()) fail(400, "invalid_token", "This reset link is no longer valid.");
    run(db, "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", await hashPassword(body.password), nowIso(), row.user_id);
    run(db, "UPDATE password_resets SET used_at = ? WHERE id = ?", nowIso(), row.id);
    run(db, "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", nowIso(), row.user_id);
    return { ok: true };
  });

  app.get("/v1/me", async (req) => {
    const auth = requireUser(db, req);
    return presentMe(db, auth.user, auth.identity);
  });

  app.patch("/v1/me", async (req) => {
    const auth = requireUser(db, req);
    if (!auth.identity) fail(403, "onboarding_required", "Create your identity first.");
    const body = z
      .object({
        displayName: z.string().min(2).max(40).optional(),
        personaCard: z.array(z.string().max(80)).max(6).optional(),
        countryCode: z.string().length(2).nullable().optional(),
        region: z.string().max(40).nullable().optional(),
        ageRange: z.string().max(16).nullable().optional(),
        languages: z.array(z.string().max(8)).max(8).optional(),
      })
      .parse(req.body);
    run(
      db,
      `UPDATE identities SET display_name = COALESCE(?, display_name),
        persona_card = COALESCE(?, persona_card),
        country_code = COALESCE(?, country_code),
        region = COALESCE(?, region),
        age_range = COALESCE(?, age_range),
        languages = COALESCE(?, languages)
       WHERE id = ?`,
      body.displayName ?? null,
      body.personaCard ? JSON.stringify(body.personaCard) : null,
      body.countryCode === undefined ? null : body.countryCode,
      body.region === undefined ? null : body.region,
      body.ageRange === undefined ? null : body.ageRange,
      body.languages ? JSON.stringify(body.languages) : null,
      auth.identity.id,
    );
    const identity = one<IdentityRow>(db, "SELECT * FROM identities WHERE id = ?", auth.identity.id);
    return presentMe(db, auth.user, identity);
  });

  app.delete("/v1/me", async (req, reply) => {
    const auth = requireUser(db, req);
    const t = nowIso();
    run(db, "UPDATE users SET deleted_at = ?, email = NULL, apple_sub = NULL, status = 'banned', updated_at = ? WHERE id = ?", t, t, auth.user.id);
    run(db, "UPDATE sessions SET revoked_at = ? WHERE user_id = ?", t, auth.user.id);
    run(db, "UPDATE questions SET status = 'removed' WHERE author_identity_id IN (SELECT id FROM identities WHERE user_id = ?)", auth.user.id);
    run(db, "UPDATE answers SET status = 'removed' WHERE author_identity_id IN (SELECT id FROM identities WHERE user_id = ?)", auth.user.id);
    run(db, "UPDATE notes SET status = 'removed' WHERE author_identity_id IN (SELECT id FROM identities WHERE user_id = ?)", auth.user.id);
    audit(db, auth.user.id, "account.delete", "user", auth.user.id);
    reply.clearCookie("thinking", { path: "/" });
    return { ok: true };
  });

  app.get("/v1/me/export", async (req) => {
    const auth = requireUser(db, req);
    const questions = many(db, "SELECT id, prompt, created_at FROM questions WHERE author_identity_id IN (SELECT id FROM identities WHERE user_id = ?)", auth.user.id);
    const answers = many(db, "SELECT id, question_id, body, created_at FROM answers WHERE author_identity_id IN (SELECT id FROM identities WHERE user_id = ?)", auth.user.id);
    const notes = many(db, "SELECT id, body, kind, created_at FROM notes WHERE author_identity_id IN (SELECT id FROM identities WHERE user_id = ?)", auth.user.id);
    return {
      exportedAt: nowIso(),
      account: { createdAt: auth.user.created_at, email: auth.user.email },
      identity: auth.identity ? identityPublic(auth.identity) : null,
      questions,
      answers,
      notes,
    };
  });

  app.post("/v1/onboarding/identity", async (req) => {
    const auth = requireUser(db, req);
    const body = z
      .object({
        displayName: z.string().min(2).max(40).optional(),
        personaCard: z.array(z.string().max(80)).max(6).optional(),
        countryCode: z.string().length(2).optional(),
        region: z.string().max(40).optional(),
        ageRange: z.string().max(16).optional(),
        languages: z.array(z.string().max(8)).max(8).optional(),
      })
      .parse(req.body ?? {});
    let identity = auth.identity;
    if (!identity) {
      const created = createIdentity(db, auth.user.id, body.displayName);
      identity = one<IdentityRow>(db, "SELECT * FROM identities WHERE id = ?", created.id)!;
    } else if (body.displayName) {
      run(db, "UPDATE identities SET display_name = ? WHERE id = ?", body.displayName, identity.id);
    }
    run(
      db,
      `UPDATE identities SET persona_card = COALESCE(?, persona_card), country_code = COALESCE(?, country_code),
        region = COALESCE(?, region), age_range = COALESCE(?, age_range), languages = COALESCE(?, languages)
       WHERE id = ?`,
      body.personaCard ? JSON.stringify(body.personaCard) : null,
      body.countryCode ?? null,
      body.region ?? null,
      body.ageRange ?? null,
      body.languages ? JSON.stringify(body.languages) : null,
      identity.id,
    );
    identity = one<IdentityRow>(db, "SELECT * FROM identities WHERE id = ?", identity.id);
    return presentMe(db, auth.user, identity);
  });

  app.post("/v1/onboarding/interests", async (req) => {
    const auth = requireUser(db, req);
    const body = z.object({ slugs: z.array(z.string()).min(1).max(12) }).parse(req.body);
    run(db, "DELETE FROM user_interests WHERE user_id = ?", auth.user.id);
    for (const slug of body.slugs) {
      const ok = one(db, "SELECT slug FROM interests WHERE slug = ?", slug);
      if (ok) run(db, "INSERT INTO user_interests (user_id, interest_slug) VALUES (?, ?)", auth.user.id, slug);
    }
    return presentMe(db, auth.user, auth.identity);
  });

  app.post("/v1/onboarding/complete", async (req) => {
    const auth = requireUser(db, req);
    run(db, "UPDATE users SET onboarding_completed = 1, updated_at = ? WHERE id = ?", nowIso(), auth.user.id);
    track(db, auth.user.id, "onboarding_completed", {});
    const user = one<UserRow>(db, "SELECT * FROM users WHERE id = ?", auth.user.id)!;
    return presentMe(db, user, auth.identity);
  });

  app.patch("/v1/me/notifications", async (req) => {
    const auth = requireUser(db, req);
    const body = z
      .object({
        replies: z.boolean().optional(),
        answers: z.boolean().optional(),
        conversations: z.boolean().optional(),
        voice: z.boolean().optional(),
        safety: z.boolean().optional(),
        moderation: z.boolean().optional(),
      })
      .parse(req.body);
    const cur = one<Record<string, number>>(db, "SELECT * FROM notification_preferences WHERE user_id = ?", auth.user.id);
    const next = {
      replies: body.replies === undefined ? cur?.replies ?? 1 : Number(body.replies),
      answers: body.answers === undefined ? cur?.answers ?? 1 : Number(body.answers),
      conversations: body.conversations === undefined ? cur?.conversations ?? 1 : Number(body.conversations),
      voice: body.voice === undefined ? cur?.voice ?? 1 : Number(body.voice),
      safety: body.safety === undefined ? cur?.safety ?? 1 : Number(body.safety),
      moderation: body.moderation === undefined ? cur?.moderation ?? 1 : Number(body.moderation),
    };
    run(
      db,
      `INSERT INTO notification_preferences (user_id, replies, answers, conversations, voice, safety, moderation)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET replies=excluded.replies, answers=excluded.answers, conversations=excluded.conversations,
         voice=excluded.voice, safety=excluded.safety, moderation=excluded.moderation`,
      auth.user.id,
      next.replies,
      next.answers,
      next.conversations,
      next.voice,
      next.safety,
      next.moderation,
    );
    return { notifications: next };
  });
}
