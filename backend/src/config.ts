import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(): void {
  for (const file of [resolve(root, ".env"), resolve(process.cwd(), ".env")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnvFile();

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const isTest = env("NODE_ENV", "development") === "test";
export const isProd = env("NODE_ENV") === "production";

export const config = {
  env: env("NODE_ENV", "development"),
  host: env("HOST", "127.0.0.1"),
  port: envInt("PORT", 8787),
  publicUrl: env("PUBLIC_URL", "http://127.0.0.1:8787"),
  logLevel: env("LOG_LEVEL", isTest ? "error" : "info"),
  root,
  databasePath: resolve(root, env("DATABASE_PATH", "./data/thinking.sqlite")),
  databaseUrl: env("DATABASE_URL"),
  sessionSecret: env("SESSION_SECRET", "dev-only-session-secret-change-me-please-32b"),
  sessionDays: envInt("SESSION_DAYS", 30),
  passwordResetMinutes: envInt("PASSWORD_RESET_MINUTES", 30),
  appleBundleId: env("APPLE_BUNDLE_ID", "app.thinking.ios"),
  appleServiceId: env("APPLE_SERVICE_ID", "app.thinking.web"),
  mediaDir: resolve(root, env("MEDIA_DIR", "./data/media")),
  voiceRetentionDays: envInt("VOICE_RETENTION_DAYS", 90),
  maxVoiceSeconds: envInt("MAX_VOICE_SECONDS", 90),
  maxVoiceBytes: envInt("MAX_VOICE_BYTES", 5_000_000),
  maxUploadBytes: envInt("MAX_UPLOAD_BYTES", 6_000_000),
  newAccountMessageLimit: envInt("NEW_ACCOUNT_MESSAGE_LIMIT_PER_HOUR", 8),
  newAccountConversationLimit: envInt("NEW_ACCOUNT_CONVERSATION_LIMIT_PER_DAY", 3),
  trustLinkThreshold: envInt("TRUST_LINK_THRESHOLD", 60),
  scamShieldThreshold: Number(env("SCAM_SHIELD_THRESHOLD", "0.72")),
  openaiKey: env("OPENAI_API_KEY"),
  openaiModel: env("OPENAI_MODEL", "gpt-4.1-mini"),
  bootstrapAdminEmail: env("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com").toLowerCase(),
  bootstrapAdminPassword: env("BOOTSTRAP_ADMIN_PASSWORD", "change-me-now"),
  analyticsEnabled: env("ANALYTICS_ENABLED", "true") !== "false",
};

export function ensureDataDirs(): void {
  mkdirSync(dirname(config.databasePath), { recursive: true });
  mkdirSync(config.mediaDir, { recursive: true });
}
