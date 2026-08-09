import { Hono } from "hono";
import type { Env } from "../types";

export const publicRoutes = new Hono<{ Bindings: Env }>();

interface PublicItemRow {
  id: string;
  isbn: string | null;
  title: string;
  authors: string | null;
  cover_url: string | null;
  notes: string | null;
}

// Unauthenticated, read-only view of a wishlist someone chose to share — gated
// on knowing the unguessable token AND the list currently being public, so
// toggling a list private instantly kills any link floating around. 404 (not
// 403) in every failure case — a shared link shouldn't reveal whether a token
// is wrong, expired, or the list was made private, to anyone poking at it.
publicRoutes.get("/wishlists/:token", async (c) => {
  const token = c.req.param("token");
  const wishlist = await c.env.DB.prepare("SELECT id, name FROM wishlists WHERE share_token = ? AND is_public = 1")
    .bind(token)
    .first<{ id: string; name: string }>();
  if (!wishlist) return c.json({ error: "Not found." }, 404);

  const { results } = await c.env.DB.prepare(
    "SELECT id, isbn, title, authors, cover_url, notes FROM wishlist_items WHERE wishlist_id = ? ORDER BY created_at DESC"
  )
    .bind(wishlist.id)
    .all<PublicItemRow>();

  return c.json({
    name: wishlist.name,
    items: results.map((row) => ({
      ...row,
      authors: row.authors ? (JSON.parse(row.authors) as string[]) : [],
    })),
  });
});
