import { Hono } from "hono";
import type { WishlistItem, Env } from "../types";
import { cacheCoverImage } from "../covers";
import { getUserFromRequest } from "../auth";
import { rowToBook, type BookRow } from "./books";

export const wishlistRoutes = new Hono<{ Bindings: Env }>();

interface WishlistRow {
  id: string;
  isbn: string | null;
  title: string;
  authors: string | null;
  cover_url: string | null;
  notes: string | null;
  source: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: WishlistRow): WishlistItem {
  return {
    ...row,
    authors: row.authors ? (JSON.parse(row.authors) as string[]) : [],
  };
}

wishlistRoutes.get("/", async (c) => {
  const q = c.req.query("q");
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (q) {
    clauses.push("(title LIKE ? OR authors LIKE ? OR isbn LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { results } = await c.env.DB.prepare(`SELECT * FROM wishlist_items ${where} ORDER BY created_at DESC`)
    .bind(...params)
    .all<WishlistRow>();
  return c.json({ items: results.map(rowToItem) });
});

interface CreateWishlistBody {
  isbn?: string | null;
  title: string;
  authors?: string[];
  coverSourceUrl?: string | null;
  notes?: string | null;
  source?: string | null;
}

wishlistRoutes.post("/", async (c) => {
  const body = await c.req.json<CreateWishlistBody>();
  if (!body.title?.trim()) {
    return c.json({ error: "Title is required." }, 400);
  }

  const isbn = body.isbn?.trim() || null;

  // Already own it? Surface that instead of letting her wishlist a duplicate.
  if (isbn) {
    const owned = await c.env.DB.prepare("SELECT id, title, cover_url FROM books WHERE isbn = ?")
      .bind(isbn)
      .first<{ id: string; title: string; cover_url: string | null }>();
    if (owned) {
      return c.json({ alreadyOwned: owned }, 409);
    }
    const existing = await c.env.DB.prepare("SELECT id, title, cover_url FROM wishlist_items WHERE isbn = ?")
      .bind(isbn)
      .first<{ id: string; title: string; cover_url: string | null }>();
    if (existing) {
      return c.json({ duplicate: existing }, 409);
    }
  }

  const user = await getUserFromRequest(c);
  const id = crypto.randomUUID();

  let coverUrl: string | null = null;
  if (body.coverSourceUrl) {
    coverUrl = await cacheCoverImage(c.env, body.coverSourceUrl, id);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO wishlist_items (id, isbn, title, authors, cover_url, notes, source, added_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      isbn,
      body.title.trim(),
      JSON.stringify(body.authors ?? []),
      coverUrl,
      body.notes ?? null,
      body.source ?? "manual",
      user?.id ?? null,
      now,
      now
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM wishlist_items WHERE id = ?").bind(id).first<WishlistRow>();
  return c.json({ item: rowToItem(row!) }, 201);
});

wishlistRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<Partial<CreateWishlistBody>>();

  const existing = await c.env.DB.prepare("SELECT * FROM wishlist_items WHERE id = ?").bind(id).first<WishlistRow>();
  if (!existing) return c.json({ error: "Wishlist item not found." }, 404);

  const sets: string[] = [];
  const params: unknown[] = [];
  if (body.title !== undefined) {
    sets.push("title = ?");
    params.push(body.title.trim());
  }
  if (body.authors !== undefined) {
    sets.push("authors = ?");
    params.push(JSON.stringify(body.authors ?? []));
  }
  if (body.isbn !== undefined) {
    sets.push("isbn = ?");
    params.push(body.isbn || null);
  }
  if (body.notes !== undefined) {
    sets.push("notes = ?");
    params.push(body.notes || null);
  }

  if (!sets.length) return c.json({ item: rowToItem(existing) });

  sets.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  await c.env.DB.prepare(`UPDATE wishlist_items SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...params)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM wishlist_items WHERE id = ?").bind(id).first<WishlistRow>();
  return c.json({ item: rowToItem(row!) });
});

wishlistRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("DELETE FROM wishlist_items WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return c.json({ error: "Wishlist item not found." }, 404);
  return c.json({ ok: true });
});

// "Got it" — move a wishlist entry into the real library as an owned book,
// then remove it from the wishlist. Reuses the cached cover rather than
// re-fetching/re-caching it.
wishlistRoutes.post("/:id/convert", async (c) => {
  const id = c.req.param("id");
  const item = await c.env.DB.prepare("SELECT * FROM wishlist_items WHERE id = ?").bind(id).first<WishlistRow>();
  if (!item) return c.json({ error: "Wishlist item not found." }, 404);

  if (item.isbn) {
    const owned = await c.env.DB.prepare("SELECT id, title, cover_url FROM books WHERE isbn = ?")
      .bind(item.isbn)
      .first<{ id: string; title: string; cover_url: string | null }>();
    if (owned) {
      return c.json({ alreadyOwned: owned }, 409);
    }
  }

  const user = await getUserFromRequest(c);
  const bookId = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO books
      (id, isbn, title, authors, cover_url, status, genres, tags, notes, format, source, added_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'to_read', '[]', '[]', ?, 'physical', ?, ?, ?, ?)`
  )
    .bind(
      bookId,
      item.isbn,
      item.title,
      item.authors,
      item.cover_url,
      item.notes,
      item.source,
      user?.id ?? null,
      now,
      now
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM books WHERE id = ?").bind(bookId).first<BookRow>();
  await c.env.DB.prepare("DELETE FROM wishlist_items WHERE id = ?").bind(id).run();

  return c.json({ book: rowToBook(row!) }, 201);
});
