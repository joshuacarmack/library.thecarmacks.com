import { Hono } from "hono";
import type { Env } from "./types";
import { authRoutes } from "./routes/auth";
import { bookRoutes } from "./routes/books";
import { wishlistRoutes } from "./routes/wishlist";
import { wishlistListRoutes } from "./routes/wishlists";
import { lookupRoutes } from "./routes/lookup";
import { coverRoutes } from "./routes/covers";
import { healthRoutes } from "./routes/health";
import { backupRoutes } from "./routes/backup";
import { publicRoutes } from "./routes/public";
import { getUserFromRequest } from "./auth";
import { runBackup } from "./backup";

const app = new Hono<{ Bindings: Env }>();

// Unauthenticated — polled by external monitoring (see README's Zabbix section).
app.route("/api/health", healthRoutes);
app.route("/api/auth", authRoutes);
// Cover images are cached content, not sensitive — served without auth so <img> tags work simply.
app.route("/api/covers", coverRoutes);
// Read-only public wishlist views — gated by an unguessable token + is_public, not auth.
app.route("/api/public", publicRoutes);

// Everything else under /api requires a logged-in session (shared library, either account).
app.use("/api/books/*", async (c, next) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: "Not authenticated." }, 401);
  await next();
});
app.use("/api/wishlist/*", async (c, next) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: "Not authenticated." }, 401);
  await next();
});
app.use("/api/wishlists/*", async (c, next) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: "Not authenticated." }, 401);
  await next();
});
app.use("/api/lookup/*", async (c, next) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: "Not authenticated." }, 401);
  await next();
});
app.use("/api/admin/*", async (c, next) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: "Not authenticated." }, 401);
  await next();
});

app.route("/api/books", bookRoutes);
app.route("/api/wishlist", wishlistRoutes);
app.route("/api/wishlists", wishlistListRoutes);
app.route("/api/lookup", lookupRoutes);
app.route("/api/admin", backupRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found." }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  // Weekly D1 -> R2 backup (see wrangler.jsonc `triggers.crons`).
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runBackup(env).then(() => undefined));
  },
};
