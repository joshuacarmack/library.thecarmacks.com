-- Wishlist: books wanted but not owned yet (Phase 2 item pulled forward).
-- Deliberately a separate table from `books` rather than a books.status value —
-- per specs.md, "distinct from To Read, which implies ownership." Converting an
-- item moves it into `books` and removes it from here.

CREATE TABLE wishlist_items (
  id TEXT PRIMARY KEY,
  isbn TEXT, -- nullable: manual/no-ISBN wishes are fine
  title TEXT NOT NULL,
  authors TEXT, -- JSON array of strings
  cover_url TEXT, -- R2-backed URL (/api/covers/:key), same convention as books
  notes TEXT, -- why she wants it / where to get it, etc.
  source TEXT, -- 'google_books' | 'open_library' | 'manual'
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_wishlist_isbn ON wishlist_items(isbn);
CREATE INDEX idx_wishlist_title ON wishlist_items(title);
