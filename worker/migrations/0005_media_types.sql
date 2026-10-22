-- Music (CD / record) and movies (DVD / Jellyfin) live in the same table as
-- books, so they share shelf locations, ratings, tags, notes, search, and
-- backups. `media_type` says which kind of item a row is; the existing
-- `format` column says which physical/digital form it takes. Existing rows
-- are all books, so the default backfills them.
--
-- For music and movies the `isbn` column holds the UPC/EAN barcode instead,
-- which keeps duplicate-on-scan detection working the same way.

ALTER TABLE books ADD COLUMN media_type TEXT NOT NULL DEFAULT 'book' CHECK (media_type IN ('book', 'music', 'movie'));
ALTER TABLE books ADD COLUMN year INTEGER;

CREATE INDEX idx_books_media_type ON books(media_type);
