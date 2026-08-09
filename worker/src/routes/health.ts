import { Hono } from "hono";
import type { Env } from "../types";

export const healthRoutes = new Hono<{ Bindings: Env }>();

/**
 * Unauthenticated liveness/readiness check for external monitoring (Zabbix, uptime robots,
 * etc). Cloudflare Workers can't host a Zabbix agent, so this is meant to be polled over
 * HTTP from outside — see README for a sample Zabbix "HTTP agent" item pointed at this route.
 *
 * Returns 200 only if every dependency actually responds, not just that the Worker is running —
 * a Worker can be "up" while D1 or R2 are unreachable, and that's the failure mode worth alerting on.
 */
healthRoutes.get("/", async (c) => {
  const checks: Record<string, "ok" | "error"> = {};
  let healthy = true;

  try {
    await c.env.DB.prepare("SELECT 1").first();
    checks.database = "ok";
  } catch {
    checks.database = "error";
    healthy = false;
  }

  try {
    // head() on a key that doesn't need to exist — a null result still proves the bucket
    // is reachable and credentials/binding are valid, without depending on prior state.
    await c.env.COVERS.head("__healthcheck__");
    checks.covers = "ok";
  } catch {
    checks.covers = "error";
    healthy = false;
  }

  try {
    await c.env.BACKUPS.head("__healthcheck__");
    checks.backups = "ok";
  } catch {
    checks.backups = "error";
    healthy = false;
  }

  c.header("Cache-Control", "no-store");
  return c.json(
    {
      status: healthy ? "ok" : "error",
      checks,
      environment: c.env.ENVIRONMENT,
      timestamp: new Date().toISOString(),
    },
    healthy ? 200 : 503
  );
});
