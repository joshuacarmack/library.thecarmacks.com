import { Hono } from "hono";
import type { Env } from "./types";
import { authRoutes } from "./routes/auth";
import { bookRoutes } from "./routes/books";
import { lookupRoutes } from "./routes/lookup";
import { coverRoutes } from "./routes/covers";
import { healthRoutes } from "./routes/health";
import { getUserFromRequest } from "./auth";

const app = new Hono<{ Bindings: Env }>();

// Unauthenticated — polled by external monitoring (see README's Zabbix section).
app.route("/api/health", healthRoutes);
app.route("/api/auth", authRoutes);
// Cover images are cached content, not sensitive — served without auth so <img> tags work simply.
app.route("/api/covers", coverRoutes);

// Everything else under /api requires a logged-in session (shared library, either account).
app.use("/api/books/*", async (c, next) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: "Not authenticated." }, 401);
  await next();
});
app.use("/api/lookup/*", async (c, next) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: "Not authenticated." }, 401);
  await next();
});

app.route("/api/books", bookRoutes);
app.route("/api/lookup", lookupRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found." }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
