-- Initial schema for the shared library app.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, -- opaque session token (hashed) stored server-side
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TABLE books (
  id TEXT PRIMARY KEY,
  isbn TEXT, -- nullable: manual entries may have no ISBN
  title TEXT NOT NULL,
  authors TEXT, -- JSON array of strings
  cover_url TEXT, -- R2-backed URL (/api/covers/:key), not the source API URL
  status TEXT NOT NULL DEFAULT 'to_read' CHECK (status IN ('to_read', 'reading', 'read')),
  rating INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  genres TEXT, -- JSON array of strings (dropdown-selected, multi-select)
  tags TEXT, -- JSON array of free-form strings
  series_name TEXT,
  series_number REAL,
  notes TEXT,
  shelf_location TEXT, -- not used in Phase 1, reserved so no migration is needed later
  format TEXT NOT NULL DEFAULT 'physical',
  source TEXT, -- 'google_books' | 'open_library' | 'manual'
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_books_isbn ON books(isbn);
CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_status ON books(status);
