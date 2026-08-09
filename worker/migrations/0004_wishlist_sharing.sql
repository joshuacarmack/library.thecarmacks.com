-- Public read-only sharing for a wishlist, via an unguessable share token in
-- the URL. is_public gates visibility independently of the token existing,
-- so toggling a list private instantly kills the old link without needing to
-- rotate the token (re-enabling later reuses the same link).

ALTER TABLE wishlists ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wishlists ADD COLUMN share_token TEXT;

CREATE UNIQUE INDEX idx_wishlists_share_token ON wishlists(share_token);
