-- Support multiple named wishlists (e.g. "Birthday ideas", "Book club",
-- "Someday") instead of one flat list.

CREATE TABLE wishlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every existing wishlist item needs a home. Create one default list with a
-- fixed, well-known id and backfill all pre-existing rows onto it.
INSERT INTO wishlists (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Wishlist');

ALTER TABLE wishlist_items
  ADD COLUMN wishlist_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES wishlists(id);

CREATE INDEX idx_wishlist_items_wishlist_id ON wishlist_items(wishlist_id);
