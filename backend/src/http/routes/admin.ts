import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../../db/index.js";
import { nowIso } from "../../util/crypto.js";
import { adjustTrust } from "../../safety/trust.js";
import { fail } from "../errors.js";
import { audit, many, one, requireAdmin, run } from "../context.js";

export function registerAdmin(app: FastifyInstance, db: Db): void {
  app.get("/v1/admin/health", async (req) => {
    requireAdmin(db, req);
    const users = one<{ c: number }>(db, "SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL")?.c ?? 0;
    const openReports = one<{ c: number }>(db, "SELECT COUNT(*) as c FROM reports WHERE status = 'open'")?.c ?? 0;
    const convos = one<{ c: number }>(db, "SELECT COUNT(*) as c FROM conversations")?.c ?? 0;
    const messages = one<{ c: number }>(db, "SELECT COUNT(*) as c FROM messages")?.c ?? 0;
    return {
      ok: true,
      users,
      openReports,
      conversations: convos,
      messages,
      uptime: process.uptime(),
    };
  });

  app.get("/v1/admin/reports", async (req) => {
    requireAdmin(db, req);
    return {
      reports: many(
        db,
        `SELECT r.*, u.email as reporter_email
         FROM reports r LEFT JOIN users u ON u.id = r.reporter_user_id
         ORDER BY r.created_at DESC LIMIT 100`,
      ),
    };
  });

  app.post("/v1/admin/reports/:id/resolve", async (req) => {
    const auth = requireAdmin(db, req);
    const body = z
      .object({
        action: z.enum(["dismiss", "warn", "restrict", "suspend", "ban"]),
        notes: z.string().max(500).optional(),
      })
      .parse(req.body);
    const report = one<{ id: string; target_user_id: string | null }>(
      db,
      "SELECT id, target_user_id FROM reports WHERE id = ?",
      (req.params as { id: string }).id,
    );
    if (!report) fail(404, "not_found", "Report not found.");
    run(
      db,
      "UPDATE reports SET status = 'actioned', resolved_at = ?, resolver_user_id = ?, resolution = ? WHERE id = ?",
      nowIso(),
      auth.user.id,
      `${body.action}:${body.notes ?? ""}`,
      report.id,
    );
    if (report.target_user_id && body.action !== "dismiss") {
      const status = body.action === "warn" ? "active" : body.action === "restrict" ? "restricted" : body.action === "suspend" ? "suspended" : "banned";
      if (body.action !== "warn") {
        run(db, "UPDATE users SET status = ?, updated_at = ? WHERE id = ?", status, nowIso(), report.target_user_id);
      }
      adjustTrust(db, report.target_user_id, "report_upheld", body.action === "ban" ? -25 : -10);
      run(
        db,
        `INSERT INTO moderation_events (id, user_id, content_type, content_id, source, severity, labels, action, reviewer_id, notes, created_at)
         VALUES (?, ?, 'report', ?, 'admin', ?, '[]', ?, ?, ?, ?)`,
        crypto.randomUUID(),
        report.target_user_id,
        report.id,
        body.action === "ban" || body.action === "suspend" ? "red" : "orange",
        body.action,
        auth.user.id,
        body.notes ?? null,
        nowIso(),
      );
    }
    audit(db, auth.user.id, "report.resolve", "report", report.id, body);
    return { ok: true };
  });

  app.get("/v1/admin/users/:id", async (req) => {
    const auth = requireAdmin(db, req);
    const user = one(db, "SELECT id, email, role, status, trust_score, created_at, deleted_at FROM users WHERE id = ?", (req.params as { id: string }).id);
    if (!user) fail(404, "not_found", "User not found.");
    audit(db, auth.user.id, "user.view", "user", (req.params as { id: string }).id);
    const identity = one(db, "SELECT id, display_name FROM identities WHERE user_id = ? AND is_active = 1", (req.params as { id: string }).id);
    const events = many(db, "SELECT * FROM moderation_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 30", (req.params as { id: string }).id);
    return { user, identity, moderation: events };
  });

  app.post("/v1/admin/users/:id/enforce", async (req) => {
    const auth = requireAdmin(db, req);
    const body = z.object({ action: z.enum(["warn", "restrict", "suspend", "ban"]), notes: z.string().max(500).optional() }).parse(req.body);
    const id = (req.params as { id: string }).id;
    const status = body.action === "warn" ? "active" : body.action === "restrict" ? "restricted" : body.action === "suspend" ? "suspended" : "banned";
    if (body.action !== "warn") run(db, "UPDATE users SET status = ?, updated_at = ? WHERE id = ?", status, nowIso(), id);
    if (body.action === "ban" || body.action === "suspend") {
      run(db, "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", nowIso(), id);
    }
    run(
      db,
      `INSERT INTO moderation_events (id, user_id, source, severity, labels, action, reviewer_id, notes, created_at)
       VALUES (?, ?, 'admin', ?, '[]', ?, ?, ?, ?)`,
      crypto.randomUUID(),
      id,
      body.action === "ban" || body.action === "suspend" ? "red" : "orange",
      body.action,
      auth.user.id,
      body.notes ?? null,
      nowIso(),
    );
    audit(db, auth.user.id, "user.enforce", "user", id, body);
    return { ok: true };
  });

  app.post("/v1/admin/users/:id/reverse", async (req) => {
    const auth = requireAdmin(db, req);
    const id = (req.params as { id: string }).id;
    run(db, "UPDATE users SET status = 'active', updated_at = ? WHERE id = ?", nowIso(), id);
    run(
      db,
      `INSERT INTO moderation_events (id, user_id, source, severity, labels, action, reviewer_id, created_at)
       VALUES (?, ?, 'admin', 'green', '[]', 'reverse', ?, ?)`,
      crypto.randomUUID(),
      id,
      auth.user.id,
      nowIso(),
    );
    audit(db, auth.user.id, "user.reverse", "user", id);
    return { ok: true };
  });

  app.get("/v1/admin/moderation", async (req) => {
    requireAdmin(db, req);
    return { events: many(db, "SELECT * FROM moderation_events ORDER BY created_at DESC LIMIT 100") };
  });

  app.get("/v1/admin/questions", async (req) => {
    requireAdmin(db, req);
    return { questions: many(db, "SELECT * FROM questions ORDER BY created_at DESC LIMIT 80") };
  });

  app.post("/v1/admin/questions", async (req) => {
    const auth = requireAdmin(db, req);
    const body = z.object({ prompt: z.string().min(8), kind: z.string().default("general"), categoryId: z.string().default("life"), featured: z.boolean().optional() }).parse(req.body);
    const id = crypto.randomUUID();
    run(
      db,
      `INSERT INTO questions (id, category_id, prompt, kind, is_featured, featured_on, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'published', ?)`,
      id,
      body.categoryId,
      body.prompt,
      body.kind,
      Number(Boolean(body.featured)),
      body.featured ? nowIso().slice(0, 10) : null,
      nowIso(),
    );
    audit(db, auth.user.id, "question.create", "question", id);
    return { id };
  });

  app.patch("/v1/admin/questions/:id", async (req) => {
    const auth = requireAdmin(db, req);
    const body = z.object({ status: z.enum(["published", "hidden", "removed"]).optional(), featured: z.boolean().optional() }).parse(req.body);
    if (body.status) run(db, "UPDATE questions SET status = ? WHERE id = ?", body.status, (req.params as { id: string }).id);
    if (body.featured !== undefined) {
      run(
        db,
        "UPDATE questions SET is_featured = ?, featured_on = ? WHERE id = ?",
        Number(body.featured),
        body.featured ? nowIso().slice(0, 10) : null,
        (req.params as { id: string }).id,
      );
    }
    audit(db, auth.user.id, "question.update", "question", (req.params as { id: string }).id, body);
    return { ok: true };
  });

  app.get("/v1/admin/analytics", async (req) => {
    requireAdmin(db, req);
    const names = many<{ name: string; c: number }>(
      db,
      "SELECT name, COUNT(*) as c FROM analytics_events GROUP BY name ORDER BY c DESC",
    );
    return {
      events: names,
      answers: one<{ c: number }>(db, "SELECT COUNT(*) as c FROM answers")?.c ?? 0,
      conversations: one<{ c: number }>(db, "SELECT COUNT(*) as c FROM conversations")?.c ?? 0,
      reports: one<{ c: number }>(db, "SELECT COUNT(*) as c FROM reports")?.c ?? 0,
      blocks: one<{ c: number }>(db, "SELECT COUNT(*) as c FROM blocks")?.c ?? 0,
    };
  });

  app.get("/v1/admin/audit", async (req) => {
    requireAdmin(db, req);
    return { audit: many(db, "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100") };
  });
}
