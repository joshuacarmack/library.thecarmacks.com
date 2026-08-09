import { Hono } from "hono";
import type { Wishlist, Env } from "../types";
import { getUserFromRequest } from "../auth";

// Manages the named lists themselves (e.g. "Birthday ideas", "Book club").
// Items within a list live in wishlist_items — see routes/wishlist.ts.
export const wishlistListRoutes = new Hono<{ Bindings: Env }>();

interface WishlistRow {
  id: string;
  name: string;
  item_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToWishlist(row: WishlistRow): Wishlist {
  return row;
}

wishlistListRoutes.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT w.*, COUNT(i.id) AS item_count
     FROM wishlists w
     LEFT JOIN wishlist_items i ON i.wishlist_id = w.id
     GROUP BY w.id
     ORDER BY w.created_at ASC`
  ).all<WishlistRow>();
  return c.json({ wishlists: results.map(rowToWishlist) });
});

wishlistListRoutes.post("/", async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: "A list name is required." }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM wishlists WHERE lower(name) = lower(?)")
    .bind(name)
    .first<{ id: string }>();
  if (existing) return c.json({ error: "A list with that name already exists." }, 409);

  const user = await getUserFromRequest(c);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare("INSERT INTO wishlists (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, name, user?.id ?? null, now, now)
    .run();

  return c.json({ wishlist: { id, name, item_count: 0, created_by: user?.id ?? null, created_at: now, updated_at: now } }, 201);
});

wishlistListRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: "A list name is required." }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM wishlists WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Wishlist not found." }, 404);

  const clash = await c.env.DB.prepare("SELECT id FROM wishlists WHERE lower(name) = lower(?) AND id != ?")
    .bind(name, id)
    .first<{ id: string }>();
  if (clash) return c.json({ error: "A list with that name already exists." }, 409);

  await c.env.DB.prepare("UPDATE wishlists SET name = ?, updated_at = ? WHERE id = ?")
    .bind(name, new Date().toISOString(), id)
    .run();

  const row = await c.env.DB.prepare(
    `SELECT w.*, COUNT(i.id) AS item_count FROM wishlists w
     LEFT JOIN wishlist_items i ON i.wishlist_id = w.id WHERE w.id = ? GROUP BY w.id`
  )
    .bind(id)
    .first<WishlistRow>();
  return c.json({ wishlist: rowToWishlist(row!) });
});

wishlistListRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM wishlists WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Wishlist not found." }, 404);

  // Delete items explicitly rather than relying on FK cascade behavior, which
  // D1 may or may not enforce depending on the foreign_keys pragma.
  await c.env.DB.prepare("DELETE FROM wishlist_items WHERE wishlist_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM wishlists WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
