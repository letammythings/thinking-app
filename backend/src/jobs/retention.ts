import { unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";
import type { Db } from "../db/index.js";
import { many, run } from "../db/index.js";
import { nowIso } from "../util/crypto.js";

export function expireVoice(db: Db): number {
  const rows = many<{ id: string; path: string }>(
    db,
    "SELECT id, path FROM voice_assets WHERE expires_at < ? AND status != 'expired'",
    nowIso(),
  );
  for (const row of rows) {
    try {
      unlinkSync(resolve(config.mediaDir, row.path));
    } catch {
      /* already gone */
    }
    run(db, "UPDATE voice_assets SET status = 'expired', path = '' WHERE id = ?", row.id);
  }
  return rows.length;
}

export function startJobs(db: Db): void {
  const tick = () => {
    try {
      expireVoice(db);
    } catch (err) {
      console.error("retention job failed", err);
    }
  };
  tick();
  setInterval(tick, 60 * 60 * 1000).unref();
}
