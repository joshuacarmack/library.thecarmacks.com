# The Carmacks' Library

Shared home book library for Meg and Joshua — scan-to-add via phone camera, browse/search/filter,
rate & take notes, plus a desktop bulk-add mode for onboarding the existing collection with a USB
barcode scanner. See [`specs.md`](./specs.md) for the full product spec.

## Stack

- **Worker**: Cloudflare Workers + [Hono](https://hono.dev), in `worker/src`
- **Database**: Cloudflare D1, schema/migrations in `worker/migrations`
- **Cover images**: Cloudflare R2 (fetched from the lookup API once, then cached — the app never
  hotlinks the source)
- **Frontend**: React + Vite + React Router, PWA-installable, in `app/src`
- **Barcode scanning**: `@zxing/browser` (camera-based ISBN scan; lazy-loaded so it doesn't bloat
  the initial bundle)
- Worker and frontend deploy together as a single Cloudflare Worker with Assets (`wrangler.jsonc`);
  `/api/*` always hits the Worker, everything else is served as a static SPA.

## One-time setup

```bash
npm install

# Create the D1 database, then paste the returned database_id into wrangler.jsonc
npx wrangler d1 create library-db

# Create the R2 bucket for cover images
npx wrangler r2 bucket create library-covers

# Apply the schema
npm run db:migrate:local    # for local dev
npm run db:migrate:remote   # once, against production
```

Optionally set a signup gate so randoms can't self-register on the public URL:

```bash
npx wrangler secret put SIGNUP_CODE
```

If set, the signup form requires that code. Once both accounts exist, you can leave it set (or
remove the `/signup` route entirely) since there's no invite/admin flow beyond that.

## Local development

```bash
npm run dev
```

This builds the frontend once and starts `wrangler dev`, which serves the built assets and the API
from the same local server (matches production routing). For frontend-only iteration with hot
reload, run `npm run dev:app` in a second terminal (proxies `/api` to `wrangler dev` on :8787) —
run `wrangler dev` separately first.

## Deploy

```bash
npm run deploy
```

Builds the frontend and deploys the Worker (with static assets) via Wrangler.

## Project layout

```
worker/
  src/
    index.ts       # Hono app, route mounting, auth gate
    auth.ts         # PBKDF2 password hashing + D1-backed sessions
    lookup.ts        # Google Books -> Open Library ISBN/text lookup
    covers.ts         # Fetch-and-cache cover images into R2
    routes/           # auth, books, lookup, covers endpoints
  migrations/         # D1 schema
app/
  src/
    pages/            # Login, Library, BookDetail, ScanAdd, ManualAdd, BulkAdd
    components/        # AppShell/bottom nav, BookCard, StarRating, BarcodeScanner
    api.ts             # Typed fetch client for the Worker API
```

## Notes / known follow-ups

- App icons are a placeholder SVG (`app/public/icons/icon.svg`). iOS requires a real PNG for the
  home-screen icon — swap in before caring about the iOS "add to home screen" experience.
- The `/signup` page is open by default; gate it with `SIGNUP_CODE` (see above) since this is a
  public URL with only two intended users.
- Duplicate-ISBN handling, manual-entry fallback, and the desktop bulk-add "needs review" queue are
  all implemented per spec — see `specs.md` for the intended UX if extending them.
- Phase 2 (recommendations, wishlist) is intentionally out of scope here.
