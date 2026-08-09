export interface Env {
  DB: D1Database;
  COVERS: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
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

export interface LookupResult {
  isbn: string | null;
  title: string;
  authors: string[];
  coverSourceUrl: string | null;
  source: "google_books" | "open_library";
}
