import type { Env } from "./types";

// Tables backed up. Deliberately excludes `sessions` — it's pure ephemeral
// auth state (tokens that expire on their own), not data worth restoring,
// and there's no reason to retain old session tokens in a long-lived backup.
const BACKUP_TABLES = ["users", "books", "wishlists", "wishlist_items"] as const;

// Weekly cron keeps this bounded automatically, but the manual "run now"
// endpoint doesn't — cap how many backups pile up in R2 either way.
const MAX_RETAINED_BACKUPS = 12;

interface BackupFile {
  createdAt: string;
  tables: Record<(typeof BACKUP_TABLES)[number], unknown[]>;
}

/** Dumps every row of every backed-up table as JSON and writes it to R2 under `backups/`. */
export async function runBackup(env: Env): Promise<{ key: string; sizeBytes: number; rowCounts: Record<string, number> }> {
  const tables = {} as BackupFile["tables"];
  const rowCounts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
    tables[table] = results;
    rowCounts[table] = results.length;
  }

  const backup: BackupFile = { createdAt: new Date().toISOString(), tables };
  const body = JSON.stringify(backup, null, 2);
  const key = `backups/library-db-${backup.createdAt.slice(0, 10)}-${Date.now()}.json`;

  await env.BACKUPS.put(key, body, { httpMetadata: { contentType: "application/json" } });
  await pruneOldBackups(env);

  return { key, sizeBytes: body.length, rowCounts };
}

async function pruneOldBackups(env: Env): Promise<void> {
  const listed = await env.BACKUPS.list({ prefix: "backups/" });
  const sorted = [...listed.objects].sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
  const stale = sorted.slice(MAX_RETAINED_BACKUPS);
  await Promise.all(stale.map((obj) => env.BACKUPS.delete(obj.key)));
}
