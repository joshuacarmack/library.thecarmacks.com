import { Hono } from "hono";
import type { Env } from "../types";
import { runBackup } from "../backup";

export const backupRoutes = new Hono<{ Bindings: Env }>();

// Manual "run a backup right now" — same code path as the weekly cron, useful
// for testing the mechanism and for a just-in-case snapshot before something
// risky (a migration, a bulk edit). Auth-gated in index.ts like everything
// else under /api/admin.
backupRoutes.post("/backup", async (c) => {
  const result = await runBackup(c.env);
  return c.json({ ok: true, ...result });
});
