import { Hono } from "hono";
import type { Env } from "../types";
import { lookupByIsbn, lookupByText } from "../lookup";

export const lookupRoutes = new Hono<{ Bindings: Env }>();

lookupRoutes.get("/isbn/:isbn", async (c) => {
  const isbn = c.req.param("isbn").replace(/[^0-9Xx]/g, "");
  if (!isbn) return c.json({ error: "A valid ISBN is required." }, 400);

  const existing = await c.env.DB.prepare("SELECT id, title, cover_url FROM books WHERE isbn = ?")
    .bind(isbn)
    .first<{ id: string; title: string; cover_url: string | null }>();

  const result = await lookupByIsbn(isbn);

  return c.json({
    found: !!result,
    result,
    duplicate: existing ?? null,
  });
});

lookupRoutes.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ error: "Query parameter 'q' is required." }, 400);
  const results = await lookupByText(q);
  return c.json({ results });
});
