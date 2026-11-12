import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { config } from "./config.js";
import type { Db } from "./db/index.js";
import { ApiError } from "./http/errors.js";
import { loadSession } from "./http/context.js";
import { registerAdmin } from "./http/routes/admin.js";
import { registerAuth } from "./http/routes/auth.js";
import { registerContent } from "./http/routes/content.js";
import { registerConversations } from "./http/routes/conversations.js";
import { registerSafety } from "./http/routes/safety.js";
import { attachSocket } from "./realtime/hub.js";

const here = dirname(fileURLToPath(import.meta.url));

export async function buildApp(db: Db): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.env === "test" ? false : { level: config.logLevel },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes } });
  await app.register(websocket);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "invalid_body", message: err.issues[0]?.message ?? "Invalid request." },
      });
    }
    if (err instanceof ApiError) {
      return reply.status(err.status).send({
        error: { code: err.code, message: err.message, ...err.extra },
      });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: "server_error", message: "Something went wrong." } });
  });

  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    if (String(reply.getHeader("content-type") ?? "").includes("application/json")) {
      reply.header("Cache-Control", "no-store");
    }
    return payload;
  });

  app.get("/v1/health", async () => ({
    ok: true,
    name: "thinking",
    env: config.env,
    time: new Date().toISOString(),
  }));

  registerAuth(app, db);
  registerContent(app, db);
  registerConversations(app, db);
  registerSafety(app, db);
  registerAdmin(app, db);

  app.get("/ws", { websocket: true }, (socket, req) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token") || undefined;
    if (!token) {
      socket.close();
      return;
    }
    const auth = loadSession(db, token);
    if (!auth) {
      socket.close();
      return;
    }
    attachSocket(auth.user.id, socket);
    socket.send(JSON.stringify({ event: "hello", payload: { ok: true } }));
    socket.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(String(raw)) as { type?: string };
        if (msg.type === "ping") socket.send(JSON.stringify({ event: "pong" }));
      } catch {
        /* ignore */
      }
    });
  });

  await app.register(staticFiles, {
    root: resolve(here, "public"),
    prefix: "/",
    decorateReply: false,
  });

  app.get("/", async (_req, reply) => reply.redirect("/app/"));
  app.get("/app", async (_req, reply) => reply.redirect("/app/"));
  app.get("/admin", async (_req, reply) => reply.redirect("/admin/"));

  return app;
}
