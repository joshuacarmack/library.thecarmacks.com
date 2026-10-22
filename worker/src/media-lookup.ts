import type { LookupResult } from "./types";
import { cleanRetailTitle } from "./barcode";

// MusicBrainz asks every client to identify itself, and rejects requests without a User-Agent.
const MB_HEADERS = {
  "User-Agent": "CarmacksLibrary/1.0 ( https://library.thecarmacks.com )",
  Accept: "application/json",
};

/** MusicBrainz allows ~1 request/second and answers 503 past that — wait and retry once. */
async function mbFetch(url: string): Promise<Response> {
  const res = await fetch(url, { headers: MB_HEADERS });
  if (res.status !== 503) return res;
  await new Promise((resolve) => setTimeout(resolve, 1100));
  return fetch(url, { headers: MB_HEADERS });
}

interface MbArtistCredit {
  name: string;
  joinphrase?: string;
}

interface MbRelease {
  id: string;
  title: string;
  date?: string;
  barcode?: string;
  "artist-credit"?: MbArtistCredit[];
  media?: Array<{ format?: string }>;
  "release-group"?: { id: string };
}

interface MbReleaseGroup {
  id: string;
  title: string;
  "first-release-date"?: string;
  "artist-credit"?: MbArtistCredit[];
}

function artistName(credits?: MbArtistCredit[]): string[] {
  if (!credits?.length) return [];
  return [credits.map((c) => c.name + (c.joinphrase ?? "")).join("").trim()];
}

function yearFrom(date?: string): number | null {
  const year = Number(date?.slice(0, 4));
  return Number.isFinite(year) && year > 1800 ? year : null;
}

function musicFormat(release: MbRelease): string | null {
  const formats = (release.media ?? []).map((m) => m.format?.toLowerCase() ?? "");
  if (formats.some((f) => f.includes("vinyl"))) return "vinyl";
  if (formats.some((f) => f.includes("cd"))) return "cd";
  return null;
}

/** Cover Art Archive by release group: picks the best cover across all pressings, so it hits more often. */
function caaCover(releaseGroupId?: string, releaseId?: string): string | null {
  if (releaseGroupId) return `https://coverartarchive.org/release-group/${releaseGroupId}/front-500`;
  if (releaseId) return `https://coverartarchive.org/release/${releaseId}/front-500`;
  return null;
}

/** Escapes Lucene special characters so user text can't break the MusicBrainz query syntax. */
function luceneEscape(text: string): string {
  return text.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
}

async function musicBrainzByBarcode(barcode: string): Promise<LookupResult | null> {
  // The same disc can be catalogued as 12-digit UPC or 13-digit EAN; ask for both.
  const variants = barcode.length === 12 ? [barcode, `0${barcode}`] : [barcode];
  const query = variants.map((v) => `barcode:${v}`).join(" OR ");
  const res = await mbFetch(`https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(query)}&limit=5&fmt=json`);
  if (!res.ok) return null;
  const data = (await res.json()) as { releases?: MbRelease[] };
  const release = data.releases?.[0];
  if (!release?.title) return null;
  return {
    isbn: barcode,
    title: release.title,
    authors: artistName(release["artist-credit"]),
    coverSourceUrl: caaCover(release["release-group"]?.id, release.id),
    year: yearFrom(release.date),
    format: musicFormat(release),
    source: "musicbrainz",
  };
}

async function musicBrainzByText(query: string): Promise<LookupResult[]> {
  const terms = luceneEscape(query);
  // Match the words against either the album title or the artist, so "radiohead ok computer" works.
  const q = `releasegroup:(${terms}) OR artist:(${terms})`;
  const res = await mbFetch(`https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(q)}&limit=10&fmt=json`);
  if (!res.ok) return [];
  const data = (await res.json()) as { "release-groups"?: MbReleaseGroup[] };
  return (data["release-groups"] ?? [])
    .filter((g) => !!g.title)
    .map((g) => ({
      isbn: null,
      title: g.title,
      authors: artistName(g["artist-credit"]),
      coverSourceUrl: caaCover(g.id),
      year: yearFrom(g["first-release-date"]),
      format: null,
      source: "musicbrainz" as const,
    }));
}

interface UpcItemDbResponse {
  items?: Array<{ title?: string; images?: string[] }>;
}

/** Generic retail UPC database. Free tier is ~100 lookups/day, which is plenty for a home library. */
async function upcItemDb(barcode: string): Promise<{ title: string; image: string | null } | null> {
  const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as UpcItemDbResponse;
  const item = data.items?.[0];
  if (!item?.title) return null;
  const image = item.images?.find((url) => url.startsWith("https://")) ?? null;
  return { title: item.title, image };
}

// --- TMDB (movies) ---

interface TmdbMovie {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
}

/** Accepts either a v3 API key (sent as a query param) or a v4 read access token (sent as a Bearer header). */
function tmdbRequest(path: string, apiKey: string, params: Record<string, string> = {}): Promise<Response> {
  const isV4Token = apiKey.startsWith("eyJ");
  const qs = new URLSearchParams({ ...params, ...(isV4Token ? {} : { api_key: apiKey }) });
  return fetch(`https://api.themoviedb.org/3${path}?${qs.toString()}`, {
    headers: { Accept: "application/json", ...(isV4Token ? { Authorization: `Bearer ${apiKey}` } : {}) },
  });
}

async function tmdbDirectors(movieId: number, apiKey: string): Promise<string[]> {
  try {
    const res = await tmdbRequest(`/movie/${movieId}/credits`, apiKey);
    if (!res.ok) return [];
    const data = (await res.json()) as { crew?: Array<{ job?: string; name?: string }> };
    return (data.crew ?? []).filter((c) => c.job === "Director" && c.name).map((c) => c.name as string);
  } catch {
    return [];
  }
}

async function tmdbSearch(query: string, apiKey: string, year?: number | null, limit = 8): Promise<LookupResult[]> {
  const params: Record<string, string> = { query, include_adult: "false" };
  if (year) params.year = String(year);
  const res = await tmdbRequest("/search/movie", apiKey, params);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: TmdbMovie[] };
  const movies = (data.results ?? []).filter((m) => !!m.title).slice(0, limit);
  // Search results don't include crew, so fetch directors for each (TMDB's rate limit is generous).
  const directors = await Promise.all(movies.map((m) => tmdbDirectors(m.id, apiKey)));
  return movies.map((m, i) => ({
    isbn: null,
    title: m.title,
    authors: directors[i],
    coverSourceUrl: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    year: yearFrom(m.release_date),
    format: null,
    source: "tmdb" as const,
  }));
}

// --- Public entry points ---

/** Music by CD/vinyl barcode: MusicBrainz first, then the generic UPC database. */
export async function lookupMusicByBarcode(barcode: string): Promise<LookupResult | null> {
  try {
    const fromMb = await musicBrainzByBarcode(barcode);
    if (fromMb) return fromMb;
  } catch {
    // fall through
  }
  try {
    const item = await upcItemDb(barcode);
    if (!item) return null;
    return { isbn: barcode, title: item.title, authors: [], coverSourceUrl: item.image, year: null, format: null, source: "upcitemdb" };
  } catch {
    return null;
  }
}

/**
 * Movies by DVD barcode. No free movie database searches by UPC, so this finds the
 * retail product name in UPCitemdb, cleans it up, then matches it on TMDB for a proper
 * poster/director/year. Without a TMDB key it returns the bare retail listing.
 */
export async function lookupMovieByBarcode(barcode: string, tmdbApiKey?: string): Promise<LookupResult | null> {
  let item: { title: string; image: string | null } | null = null;
  try {
    item = await upcItemDb(barcode);
  } catch {
    return null;
  }
  if (!item) return null;

  const { title, year } = cleanRetailTitle(item.title);
  if (tmdbApiKey) {
    try {
      const matches = await tmdbSearch(title, tmdbApiKey, year, 1);
      if (matches[0]) return { ...matches[0], isbn: barcode };
      // A wrong year in the retail listing is common (it's often the DVD release year) — retry without it.
      if (year) {
        const retry = await tmdbSearch(title, tmdbApiKey, null, 1);
        if (retry[0]) return { ...retry[0], isbn: barcode };
      }
    } catch {
      // fall through to the retail listing
    }
  }
  return { isbn: barcode, title, authors: [], coverSourceUrl: item.image, year, format: null, source: "upcitemdb" };
}

export async function searchMusic(query: string): Promise<LookupResult[]> {
  try {
    return await musicBrainzByText(query);
  } catch {
    return [];
  }
}

export async function searchMovies(query: string, tmdbApiKey?: string): Promise<LookupResult[]> {
  if (!tmdbApiKey) return [];
  try {
    return await tmdbSearch(query, tmdbApiKey);
  } catch {
    return [];
  }
}
