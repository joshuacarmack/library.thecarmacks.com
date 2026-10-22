export interface Env {
  DB: D1Database;
  COVERS: R2Bucket;
  BACKUPS: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  SIGNUP_CODE?: string;
  /** Optional — raises the Google Books lookup quota above the shared unauthenticated limit. */
  GOOGLE_BOOKS_API_KEY?: string;
  /** Optional — enables movie lookups (posters, directors) via TMDB. v3 API key or v4 read token. */
  TMDB_API_KEY?: string;
}

export type BookStatus = "to_read" | "reading" | "read";
export type MediaType = "book" | "music" | "movie";

export interface BookRecord {
  id: string;
  media_type: MediaType;
  isbn: string | null;
  title: string;
  authors: string[];
  cover_url: string | null;
  status: BookStatus;
  rating: number | null;
  genres: string[];
  tags: string[];
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

export interface WishlistItem {
  id: string;
  wishlist_id: string;
  isbn: string | null;
  title: string;
  authors: string[];
  cover_url: string | null;
  notes: string | null;
  source: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Wishlist {
  id: string;
  name: string;
  item_count: number;
  is_public: boolean;
  share_token: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LookupResult {
  /** ISBN for books; UPC/EAN barcode for music and movies. */
  isbn: string | null;
  title: string;
  /** Authors for books, artists for music, directors for movies. */
  authors: string[];
  coverSourceUrl: string | null;
  year?: number | null;
  /** Best guess at the format (e.g. "vinyl" from MusicBrainz), when the source knows it. */
  format?: string | null;
  source: "google_books" | "open_library" | "musicbrainz" | "tmdb" | "upcitemdb";
}
