export interface Env {
  DB: D1Database;
  COVERS: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  SIGNUP_CODE?: string;
  /** Optional — raises the Google Books lookup quota above the shared unauthenticated limit. */
  GOOGLE_BOOKS_API_KEY?: string;
}

export type BookStatus = "to_read" | "reading" | "read";

export interface BookRecord {
  id: string;
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
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LookupResult {
  isbn: string | null;
  title: string;
  authors: string[];
  coverSourceUrl: string | null;
  source: "google_books" | "open_library";
}
