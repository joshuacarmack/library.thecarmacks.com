import { Hono } from "hono";
import type { Env } from "../types";
import {
  attachSessionCookie,
  clearSessionCookie,
  createSession,
  destroySession,
  getUserFromRequest,
  hashPassword,
  verifyPassword,
  SESSION_COOKIE,
} from "../auth";
import { getCookie } from "hono/cookie";

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post("/signup", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; displayName?: string; signupCode?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password || password.length < 8) {
    return c.json({ error: "Email and a password of at least 8 characters are required." }, 400);
  }

  const requiredCode = c.env.SIGNUP_CODE;
  if (requiredCode && body.signupCode !== requiredCode) {
    return c.json({ error: "Invalid signup code." }, 403);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    return c.json({ error: "An account with that email already exists." }, 409);
  }

  const id = crypto.randomUUID();
  const { hash, salt } = await hashPassword(password);
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, password_salt, display_name) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, email, hash, salt, body.displayName ?? null)
    .run();

  const token = await createSession(c.env, id);
  attachSessionCookie(c, token);
  return c.json({ id, email, displayName: body.displayName ?? null });
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return c.json({ error: "Email and password are required." }, 400);
  }

  const user = await c.env.DB.prepare(
    "SELECT id, email, password_hash, password_salt, display_name FROM users WHERE email = ?"
  )
    .bind(email)
    .first<{ id: string; email: string; password_hash: string; password_salt: string; display_name: string | null }>();

  if (!user || !(await verifyPassword(password, user.password_hash, user.password_salt))) {
    return c.json({ error: "Invalid email or password." }, 401);
  }

  const token = await createSession(c.env, user.id);
  attachSessionCookie(c, token);
  return c.json({ id: user.id, email: user.email, displayName: user.display_name });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await destroySession(c.env, token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: "Not authenticated." }, 401);
  return c.json(user);
});
