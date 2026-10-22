import { Hono } from "hono";
import type { BookRecord, BookStatus, Env, MediaType } from "../types";
import { cacheCoverImage } from "../covers";
import { getUserFromRequest } from "../auth";
import { LOCATIONS, MEDIA_FORMATS, MEDIA_TYPES } from "../constants";
import { normalizeBarcode } from "../barcode";

const VALID_LOCATIONS = new Set<string>(LOCATIONS);

/** Returns an error message if shelfLocation is set but not one of the fixed options; null if fine. */
function shelfLocationError(shelfLocation: string | null | undefined): string | null {
  if (!shelfLocation) return null;
  return VALID_LOCATIONS.has(shelfLocation) ? null : `Shelf location must be one of: ${LOCATIONS.join(", ")}.`;
}

/** Returns an error message if format isn't allowed for this media type; null if fine. */
function formatError(mediaType: MediaType, format: string | null | undefined): string | null {
  if (format === undefined || format === null) return null;
  const allowed = MEDIA_FORMATS[mediaType];
  return allowed.includes(format) ? null : `Format for ${mediaType} must be one of: ${allowed.join(", ")}.`;
}

function isMediaType(value: unknown): value is MediaType {
  return (MEDIA_TYPES as readonly unknown[]).includes(value);
}

/** Books keep their ISBN as typed; CD/DVD barcodes get the same UPC/EAN normalization as lookups. */
function normalizeCode(mediaType: MediaType, code: string | null | undefined): string | null {
  const trimmed = code?.trim();
  if (!trimmed) return null;
  return mediaType === "book" ? trimmed : normalizeBarcode(trimmed) || null;
}

export const bookRoutes = new Hono<{ Bindings: Env }>();

export interface BookRow {
  id: string;
  media_type: MediaType;
  isbn: string | null;
  title: string;
  authors: string | null;
  cover_url: string | null;
  status: BookStatus;
  rating: number | null;
  genres: string | null;
  tags: string | null;
  series_name: string | null;
  series_number: number | null;
  notes: string | null;
  shelf_location: string | null;
  format: string;
  year: number | null;
  source: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToBook(row: BookRow): BookRecord {
  return {
    ...row,
    authors: row.authors ? (JSON.parse(row.authors) as string[]) : [],
    genres: row.genres ? (JSON.parse(row.genres) as string[]) : [],
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
  };
}

const SORTABLE_COLUMNS = new Set(["title", "created_at", "rating", "status", "series_name", "shelf_location", "year"]);

bookRoutes.get("/", async (c) => {
  const { q, type, format, status, genre, tag, shelf, sort = "created_at", dir = "desc" } = c.req.query();

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (type) {
    clauses.push("media_type = ?");
    params.push(type);
  }
  if (format) {
    clauses.push("format = ?");
    params.push(format);
  }

  if (q) {
    clauses.push("(title LIKE ? OR authors LIKE ? OR isbn LIKE ? OR shelf_location LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (genre) {
    clauses.push("genres LIKE ?");
    params.push(`%"${genre}"%`);
  }
  if (tag) {
    clauses.push("tags LIKE ?");
    params.push(`%"${tag}"%`);
  }
  if (shelf) {
    clauses.push("shelf_location = ?");
    params.push(shelf);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sortCol = SORTABLE_COLUMNS.has(sort) ? sort : "created_at";
  const sortDir = dir === "asc" ? "ASC" : "DESC";

  const stmt = c.env.DB.prepare(
    `SELECT * FROM books ${where} ORDER BY ${sortCol} ${sortDir}, id DESC`
  ).bind(...params);
  const { results } = await stmt.all<BookRow>();
  return c.json({ books: results.map(rowToBook) });
});

bookRoutes.get("/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM books WHERE id = ?").bind(c.req.param("id")).first<BookRow>();
  if (!row) return c.json({ error: "Book not found." }, 404);
  return c.json({ book: rowToBook(row) });
});

interface CreateBookBody {
  mediaType?: MediaType;
  format?: string | null;
  year?: number | null;
  isbn?: string | null;
  title: string;
  authors?: string[];
  coverSourceUrl?: string | null; // uncached source URL to fetch & store in R2
  coverUrl?: string | null; // already-cached /api/covers/... URL (e.g. from a manual photo upload) — used as-is
  status?: BookStatus;
  rating?: number | null;
  genres?: string[];
  tags?: string[];
  seriesName?: string | null;
  seriesNumber?: number | null;
  notes?: string | null;
  shelfLocation?: string | null;
  source?: string | null;
  allowDuplicate?: boolean;
}

bookRoutes.post("/", async (c) => {
  const body = await c.req.json<CreateBookBody>();
  if (!body.title?.trim()) {
    return c.json({ error: "Title is required." }, 400);
  }
  const shelfError = shelfLocationError(body.shelfLocation);
  if (shelfError) return c.json({ error: shelfError }, 400);

  const mediaType = body.mediaType ?? "book";
  if (!isMediaType(mediaType)) {
    return c.json({ error: `Media type must be one of: ${MEDIA_TYPES.join(", ")}.` }, 400);
  }
  const fmtError = formatError(mediaType, body.format);
  if (fmtError) return c.json({ error: fmtError }, 400);
  const format = body.format ?? MEDIA_FORMATS[mediaType][0];

  const isbn = normalizeCode(mediaType, body.isbn);
  if (isbn && !body.allowDuplicate) {
    const existing = await c.env.DB.prepare("SELECT id, title, cover_url FROM books WHERE isbn = ?")
      .bind(isbn)
      .first<{ id: string; title: string; cover_url: string | null }>();
    if (existing) {
      return c.json({ duplicate: existing }, 409);
    }
  }

  const user = await getUserFromRequest(c);
  const id = crypto.randomUUID();

  let coverUrl: string | null = body.coverUrl || null;
  if (!coverUrl && body.coverSourceUrl) {
    coverUrl = await cacheCoverImage(c.env, body.coverSourceUrl, id);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO books
      (id, media_type, isbn, title, authors, cover_url, status, rating, genres, tags, series_name, series_number, notes, shelf_location, format, year, source, added_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      mediaType,
      isbn,
      body.title.trim(),
      JSON.stringify(body.authors ?? []),
      coverUrl,
      body.status ?? "to_read",
      body.rating ?? null,
      JSON.stringify(body.genres ?? []),
      JSON.stringify(body.tags ?? []),
      body.seriesName ?? null,
      body.seriesNumber ?? null,
      body.notes ?? null,
      body.shelfLocation ?? null,
      format,
      body.year ?? null,
      body.source ?? "manual",
      user?.id ?? null,
      now,
      now
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM books WHERE id = ?").bind(id).first<BookRow>();
  return c.json({ book: rowToBook(row!) }, 201);
});

interface UpdateBookBody extends Partial<CreateBookBody> {}

const UPDATABLE_FIELDS: Record<string, (v: unknown) => unknown> = {
  isbn: (v) => v ?? null,
  title: (v) => (v as string)?.trim(),
  authors: (v) => JSON.stringify(v ?? []),
  status: (v) => v,
  rating: (v) => v ?? null,
  genres: (v) => JSON.stringify(v ?? []),
  tags: (v) => JSON.stringify(v ?? []),
  notes: (v) => v ?? null,
  shelfLocation: (v) => v ?? null,
  format: (v) => v,
  year: (v) => v ?? null,
};

const FIELD_KEY_MAP: Record<string, string> = {
  seriesName: "series_name",
  seriesNumber: "series_number",
  shelfLocation: "shelf_location",
};

bookRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<UpdateBookBody>();

  const existing = await c.env.DB.prepare("SELECT * FROM books WHERE id = ?").bind(id).first<BookRow>();
  if (!existing) return c.json({ error: "Book not found." }, 404);

  if (body.shelfLocation !== undefined) {
    const shelfError = shelfLocationError(body.shelfLocation);
    if (shelfError) return c.json({ error: shelfError }, 400);
  }
  // Media type itself isn't editable (a CD doesn't become a movie), but its format is.
  if (body.format !== undefined) {
    if (body.format === null) return c.json({ error: "Format can't be empty." }, 400);
    const fmtError = formatError(existing.media_type, body.format);
    if (fmtError) return c.json({ error: fmtError }, 400);
  }
  if (body.isbn !== undefined) body.isbn = normalizeCode(existing.media_type, body.isbn);

  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (key === "coverSourceUrl") continue;
    const column = FIELD_KEY_MAP[key] ?? key;
    if (key in UPDATABLE_FIELDS) {
      sets.push(`${column} = ?`);
      params.push(UPDATABLE_FIELDS[key](value));
    } else if (column === "series_name" || column === "series_number") {
      sets.push(`${column} = ?`);
      params.push(value ?? null);
    }
  }

  if (body.coverUrl) {
    sets.push("cover_url = ?");
    params.push(body.coverUrl);
  } else if (body.coverSourceUrl) {
    const coverUrl = await cacheCoverImage(c.env, body.coverSourceUrl, id);
    if (coverUrl) {
      sets.push("cover_url = ?");
      params.push(coverUrl);
    }
  }

  if (!sets.length) return c.json({ book: rowToBook(existing) });

  sets.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  await c.env.DB.prepare(`UPDATE books SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...params)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM books WHERE id = ?").bind(id).first<BookRow>();
  return c.json({ book: rowToBook(row!) });
});

bookRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("DELETE FROM books WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return c.json({ error: "Book not found." }, 404);
  return c.json({ ok: true });
});
