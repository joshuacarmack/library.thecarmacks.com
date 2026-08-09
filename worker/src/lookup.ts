import type { LookupResult } from "./types";

interface GoogleBooksResponse {
  totalItems: number;
  items?: Array<{
    volumeInfo?: {
      title?: string;
      authors?: string[];
      imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      industryIdentifiers?: Array<{ type: string; identifier: string }>;
    };
  }>;
}

interface OpenLibraryIsbnResponse {
  title?: string;
  authors?: Array<{ key: string }>;
  covers?: number[];
}

function googleBooksUrl(query: string, apiKey?: string, extra = ""): string {
  const key = apiKey ? `&key=${encodeURIComponent(apiKey)}` : "";
  return `https://www.googleapis.com/books/v1/volumes?q=${query}${extra}${key}`;
}

async function googleBooksByIsbn(isbn: string, apiKey?: string): Promise<LookupResult | null> {
  const res = await fetch(googleBooksUrl(`isbn:${encodeURIComponent(isbn)}`, apiKey));
  if (!res.ok) return null;
  const data = (await res.json()) as GoogleBooksResponse;
  const info = data.items?.[0]?.volumeInfo;
  if (!info?.title) return null;
  const cover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
  return {
    isbn,
    title: info.title,
    authors: info.authors ?? [],
    coverSourceUrl: cover ? cover.replace(/^http:/, "https:") : null,
    source: "google_books",
  };
}

async function googleBooksByText(query: string, apiKey?: string): Promise<LookupResult[]> {
  const res = await fetch(googleBooksUrl(encodeURIComponent(query), apiKey, "&maxResults=10"));
  if (!res.ok) return [];
  const data = (await res.json()) as GoogleBooksResponse;
  return (data.items ?? [])
    .map((item) => item.volumeInfo)
    .filter((info): info is NonNullable<typeof info> => !!info?.title)
    .map((info) => {
      const isbn13 = info.industryIdentifiers?.find((id) => id.type === "ISBN_13")?.identifier;
      const isbn10 = info.industryIdentifiers?.find((id) => id.type === "ISBN_10")?.identifier;
      const cover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
      return {
        isbn: isbn13 ?? isbn10 ?? null,
        title: info.title as string,
        authors: info.authors ?? [],
        coverSourceUrl: cover ? cover.replace(/^http:/, "https:") : null,
        source: "google_books" as const,
      };
    });
}

async function openLibraryByIsbn(isbn: string): Promise<LookupResult | null> {
  const res = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
  if (!res.ok) return null;
  const data = (await res.json()) as OpenLibraryIsbnResponse;
  if (!data.title) return null;

  let authors: string[] = [];
  if (data.authors?.length) {
    const authorNames = await Promise.all(
      data.authors.map(async (a) => {
        try {
          const authorRes = await fetch(`https://openlibrary.org${a.key}.json`);
          if (!authorRes.ok) return null;
          const authorData = (await authorRes.json()) as { name?: string };
          return authorData.name ?? null;
        } catch {
          return null;
        }
      })
    );
    authors = authorNames.filter((n): n is string => !!n);
  }

  const coverSourceUrl = data.covers?.[0] ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg` : null;

  return {
    isbn,
    title: data.title,
    authors,
    coverSourceUrl,
    source: "open_library",
  };
}

async function openLibraryByText(query: string): Promise<LookupResult[]> {
  const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    docs?: Array<{
      title?: string;
      author_name?: string[];
      isbn?: string[];
      cover_i?: number;
    }>;
  };
  return (data.docs ?? [])
    .filter((d): d is typeof d & { title: string } => !!d.title)
    .map((d) => ({
      isbn: d.isbn?.[0] ?? null,
      title: d.title,
      authors: d.author_name ?? [],
      coverSourceUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
      source: "open_library" as const,
    }));
}

/**
 * Look up a single book by ISBN: Google Books first, then Open Library.
 * `googleApiKey` is optional — the unauthenticated Google Books endpoint shares a low
 * global quota across all callers and gets exhausted easily, so set GOOGLE_BOOKS_API_KEY
 * in production if lookups start silently falling back to Open Library more than expected.
 */
export async function lookupByIsbn(isbn: string, googleApiKey?: string): Promise<LookupResult | null> {
  try {
    const fromGoogle = await googleBooksByIsbn(isbn, googleApiKey);
    if (fromGoogle) return fromGoogle;
  } catch {
    // fall through to Open Library
  }
  try {
    return await openLibraryByIsbn(isbn);
  } catch {
    return null;
  }
}

/** Text search fallback (title/author), same provider order. */
export async function lookupByText(query: string, googleApiKey?: string): Promise<LookupResult[]> {
  try {
    const fromGoogle = await googleBooksByText(query, googleApiKey);
    if (fromGoogle.length) return fromGoogle;
  } catch {
    // fall through to Open Library
  }
  try {
    return await openLibraryByText(query);
  } catch {
    return [];
  }
}
