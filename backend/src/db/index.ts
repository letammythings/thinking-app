import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { hashPassword, nowIso } from "../util/crypto.js";
import { generateDisplayName } from "../util/names.js";
import { seedReferenceData } from "./seed.js";

const here = dirname(fileURLToPath(import.meta.url));

export type Db = DatabaseSync;

export function openDatabase(path = config.databasePath): Db {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  const schema = readFileSync(resolve(here, "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}

type SqlValue = null | number | string | bigint | Uint8Array;

export function one<T>(db: Db, sql: string, ...params: SqlValue[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function many<T>(db: Db, sql: string, ...params: SqlValue[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(db: Db, sql: string, ...params: SqlValue[]): void {
  db.prepare(sql).run(...params);
}

export async function bootstrap(db: Db): Promise<void> {
  seedReferenceData(db);
  const admin = one<{ id: string }>(
    db,
    "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL",
    config.bootstrapAdminEmail,
  );
  if (!admin && config.bootstrapAdminPassword) {
    const id = crypto.randomUUID();
    const t = nowIso();
    run(
      db,
      `INSERT INTO users (id, email, password_hash, role, status, age_confirmed, birth_date, trust_score, onboarding_completed, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', 1, '1990-01-01', 90, 1, ?, ?)`,
      id,
      config.bootstrapAdminEmail,
      await hashPassword(config.bootstrapAdminPassword),
      t,
      t,
    );
    run(
      db,
      `INSERT INTO identities (id, user_id, display_name, persona_card, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      crypto.randomUUID(),
      id,
      "Harbor Keeper",
      JSON.stringify(["Looks after the room", "Reads reports", "Keeps it human"]),
      t,
    );
    run(db, "INSERT INTO notification_preferences (user_id) VALUES (?)", id);
  }
}

export function publicIdentity(row: {
  id: string;
  display_name: string;
  persona_card: string | null;
  country_code: string | null;
  region: string | null;
  age_range: string | null;
  languages: string | null;
}): Record<string, unknown> {
  return {
    id: row.id,
    displayName: row.display_name,
    personaCard: row.persona_card ? JSON.parse(row.persona_card) : [],
    countryCode: row.country_code,
    region: row.region,
    ageRange: row.age_range,
    languages: row.languages ? JSON.parse(row.languages) : [],
  };
}

export function createIdentity(
  db: Db,
  userId: string,
  displayName?: string,
): { id: string; display_name: string } {
  const id = crypto.randomUUID();
  const name = displayName?.trim() || generateDisplayName();
  run(
    db,
    `INSERT INTO identities (id, user_id, display_name, is_active, created_at)
     VALUES (?, ?, ?, 1, ?)`,
    id,
    userId,
    name,
    nowIso(),
  );
  return { id, display_name: name };
}
