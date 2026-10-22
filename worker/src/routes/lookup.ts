import { Hono } from "hono";
import type { Env } from "../types";
import { lookupByIsbn, lookupByText } from "../lookup";
import { lookupMovieByBarcode, lookupMusicByBarcode, searchMovies, searchMusic } from "../media-lookup";
import { isValidIsbn, normalizeIsbn } from "../isbn";
import { isValidBarcode, normalizeBarcode } from "../barcode";

export const lookupRoutes = new Hono<{ Bindings: Env }>();

async function findDuplicate(env: Env, code: string) {
  return env.DB.prepare("SELECT id, title, cover_url FROM books WHERE isbn = ?")
    .bind(code)
    .first<{ id: string; title: string; cover_url: string | null }>();
}

lookupRoutes.get("/isbn/:isbn", async (c) => {
  const isbn = normalizeIsbn(c.req.param("isbn"));
  if (!isbn || (isbn.length !== 10 && isbn.length !== 13)) {
    return c.json({ error: "A valid 10 or 13-digit ISBN is required." }, 400);
  }

  const existing = await findDuplicate(c.env, isbn);
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

// CD / record / DVD barcodes (UPC or EAN). ?type=music|movie picks the database.
lookupRoutes.get("/barcode/:code", async (c) => {
  const type = c.req.query("type");
  if (type !== "music" && type !== "movie") {
    return c.json({ error: "Query parameter 'type' must be 'music' or 'movie'." }, 400);
  }
  const code = normalizeBarcode(c.req.param("code"));
  if (![8, 12, 13, 14].includes(code.length)) {
    return c.json({ error: "A valid 8, 12, 13, or 14-digit barcode is required." }, 400);
  }

  const existing = await findDuplicate(c.env, code);
  const result =
    type === "music" ? await lookupMusicByBarcode(code) : await lookupMovieByBarcode(code, c.env.TMDB_API_KEY);

  return c.json({ found: !!result, result, duplicate: existing ?? null, validChecksum: isValidBarcode(code) });
});

lookupRoutes.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ error: "Query parameter 'q' is required." }, 400);
  const type = c.req.query("type") ?? "book";
  if (type === "music") return c.json({ results: await searchMusic(q) });
  if (type === "movie") {
    // Movie search needs TMDB; tell the client so it can explain instead of showing "no results".
    if (!c.env.TMDB_API_KEY) return c.json({ results: [], unavailable: "Movie search isn't set up yet (missing TMDB_API_KEY)." });
    return c.json({ results: await searchMovies(q, c.env.TMDB_API_KEY) });
  }
  const results = await lookupByText(q, c.env.GOOGLE_BOOKS_API_KEY);
  return c.json({ results });
});
