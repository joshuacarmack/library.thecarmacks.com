import { Hono } from "hono";
import type { Env } from "../types";
import { lookupByIsbn, lookupByText } from "../lookup";
import { isValidIsbn, normalizeIsbn } from "../isbn";

export const lookupRoutes = new Hono<{ Bindings: Env }>();

lookupRoutes.get("/isbn/:isbn", async (c) => {
  const isbn = normalizeIsbn(c.req.param("isbn"));
  if (!isbn || (isbn.length !== 10 && isbn.length !== 13)) {
    return c.json({ error: "A valid 10 or 13-digit ISBN is required." }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT id, title, cover_url FROM books WHERE isbn = ?")
    .bind(isbn)
    .first<{ id: string; title: string; cover_url: string | null }>();

  const result = await lookupByIsbn(isbn, c.env.GOOGLE_BOOKS_API_KEY);

  return c.json({
    found: !!result,
    result,
    duplicate: existing ?? null,
    // Surfaced so the client can nudge "try scanning again" on a likely misread,
    // without ever blocking the lookup itself (some real ISBNs are still catalogued
    // even if the checksum math looks off due to publisher-side data entry errors).
    validChecksum: isValidIsbn(isbn),
  });
});

lookupRoutes.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ error: "Query parameter 'q' is required." }, 400);
  const results = await lookupByText(q, c.env.GOOGLE_BOOKS_API_KEY);
  return c.json({ results });
});
