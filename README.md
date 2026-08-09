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

The unauthenticated Google Books endpoint shares a small **global** quota across every caller on
the internet — in testing it was already exhausted (`429 rateLimitExceeded`) before this app made
a single request, meaning the app was quietly falling back to Open Library for everything. Get a
free key from the [Google Cloud Console](https://console.cloud.google.com/apis/library/books.googleapis.com)
(enable the "Books API", create an API key) and set it to fix this:

```bash
npx wrangler secret put GOOGLE_BOOKS_API_KEY
```

Lookups work without it (Open Library fallback covers most ISBNs), but cover art and metadata
quality are noticeably better from Google Books when it's reachable.

Once migrations are applied and the app is running (`npm run dev` or deployed), create the two
accounts:

```bash
node scripts/seed-accounts.mjs                                # local dev, http://127.0.0.1:8787
node scripts/seed-accounts.mjs https://library.thecarmacks.com # production
```

Prompts for each name/email/password interactively (password input is masked in a real terminal).
Set `SIGNUP_CODE` in the environment first if you set that secret above.

## Local development

```bash
npm run dev
```

This builds the frontend once and starts `wrangler dev`, which serves the built assets and the API
from the same local server (matches production routing). For frontend-only iteration with hot
reload, run `npm run dev:app` in a second terminal (proxies `/api` to `wrangler dev` on :8787) —
run `wrangler dev` separately first.

## Tests

```bash
npm test
```

Runs the Worker tests (`worker/test/`) inside the actual Workers runtime via
`@cloudflare/vitest-pool-workers` — unit tests for password hashing/verification and ISBN
normalization/checksum validation, plus integration tests that hit the real Hono app
(`SELF.fetch`) end to end: auth gating, signup/login/logout, book CRUD, and duplicate-ISBN
handling. `npm run typecheck` covers the rest.

## Monitoring (Zabbix)

`GET /api/health` is an unauthenticated liveness/readiness check — no cookie, no session:

```bash
curl https://library.thecarmacks.com/api/health
```

```json
{"status":"ok","checks":{"database":"ok","covers":"ok"},"environment":"production","timestamp":"..."}
```

It returns `200` only if D1 and R2 are both actually reachable (not just that the Worker itself
responds — a Worker can be "up" while its dependencies aren't), and `503` with the failing check(s)
named otherwise. `Cache-Control: no-store` so nothing between Zabbix and the Worker caches a stale
result.

Cloudflare Workers can't run a Zabbix agent, so poll this from the Zabbix server side as an
**HTTP agent** item (Data collection → Hosts → your host → Items → Create item):

| Field | Value |
|---|---|
| Type | HTTP agent |
| Key | `library.health` (or any unique key) |
| URL | `https://library.thecarmacks.com/api/health` |
| Request type | GET |
| Type of information | Text |
| Update interval | `1m` (a personal-use app doesn't need tighter than this) |

Then add a trigger on that item, e.g.:

```
find(/YourHost/library.health,,"regexp","\"status\":\"ok\"")=0
```

...or simpler, a second HTTP agent item with **Type of information: Numeric (unsigned)** reading
the HTTP status code directly, with a trigger firing when it's not `200`. Either approach also
naturally alerts on total unreachability (DNS failure, TLS error, timeout), since those show up as
an item read failure in Zabbix regardless of which check method you use.

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
    isbn.ts            # ISBN normalization + checksum validation
    routes/           # auth, books, lookup, covers endpoints
  migrations/         # D1 schema
  test/               # vitest (unit + SELF.fetch integration tests)
app/
  src/
    pages/            # Login, Library, BookDetail, ScanAdd, ManualAdd, BulkAdd
    components/        # AppShell/bottom nav, BookCard, StarRating, BarcodeScanner, ErrorBoundary
    hooks/              # useOnlineStatus
    api.ts             # Typed fetch client for the Worker API
scripts/
  generate-icons.mjs   # Regenerates the PWA PNG icons
  seed-accounts.mjs     # Creates the two accounts against a running instance
```

## Notes / known follow-ups

- App icons (`app/public/icons/icon-192.png`, `icon-512.png`) are programmatically generated
  placeholders (`scripts/generate-icons.mjs` — regenerate with `node scripts/generate-icons.mjs`
  after editing `icon.svg`). Functional for PWA install on iOS/Android, but swap in real branded
  artwork whenever you get around to it.
- The `/signup` page is open by default; gate it with `SIGNUP_CODE` (see above) since this is a
  public URL with only two intended users.
- Duplicate-ISBN handling, manual-entry fallback, and the desktop bulk-add "needs review" queue are
  all implemented per spec — see `specs.md` for the intended UX if extending them.
- Phase 2 (recommendations, wishlist) is intentionally out of scope here.
