# Library App — Spec

## Overview
A mobile-first web app for Meg (and Joshua) to scan in her physical book collection, automatically pull in book details/cover art, track reading status, rate books, and jot notes. One shared library — not per-user collections.

- **URL:** library.thecarmacks.com
- **Auth:** Email + password (both Joshua and Meg have accounts)
- **Phase:** This spec covers Phase 1 only. Phase 2 (recommendations, shopping/wishlist) is out of scope for now — noted at the end for context.

## Tech Stack
- **Backend/hosting:** Cloudflare Workers
- **Database:** Cloudflare D1
- **Cover image storage:** Cloudflare R2 (cache covers on first fetch rather than hotlinking the source API)
- **Frontend:** React, mobile-first, installable as a PWA so it behaves like an app on her phone
- **Barcode scanning:** In-browser camera barcode scan (JS barcode-reading library) reading the ISBN from the book's back cover

## Book Lookup Flow
1. Scan ISBN barcode via phone camera.
2. Look up ISBN against **Google Books API** first.
3. If not found, fall back to **Open Library API**.
4. If neither returns a match, fall back to manual entry (see below).
5. On successful lookup, download and cache the cover image in R2; store the R2 URL, not the source URL.
6. If the scanned ISBN already exists in the library, prompt the user ("You already have this book — view it? / add anyway?") rather than silently blocking or silently duplicating.

## Manual Entry Fallback
For books with no barcode, a damaged barcode, or a failed lookup:
1. First offer a title/author search (same lookup APIs, searched by text instead of ISBN).
2. If that also fails, offer a full manual entry form covering all fields below.

## Data Model — Book Record
| Field | Notes |
|---|---|
| Title | From lookup or manual entry |
| Author(s) | From lookup or manual entry |
| Cover image | Cached in R2 |
| ISBN | From scan or manual entry |
| Status | To Read / Reading / Read |
| Rating | 5-star scale (nullable until rated) |
| Genre | Fixed dropdown (single or multi-select — decide during build) |
| Tags | Free-form, user-defined, multiple per book |
| Series name | Optional |
| Series number | Optional, numeric |
| Notes | Free-text field for her thoughts/review |
| Date added | Auto-set on creation |
| Format | Physical only in Phase 1 (no field needed yet, or hardcode "physical") |

Shelf/location field: **not required for Phase 1**, but worth designing the schema so it could be added later without a painful migration.

## Core Features (Phase 1)
- Email/password login (shared library, both accounts see the same data)
- Scan-to-add flow (camera → ISBN → lookup → cover fetch → confirm/edit → save)
- Manual add flow (search → manual form fallback)
- Duplicate-ISBN prompt on re-scan
- Library view: browse/search/filter/sort by title, author, genre, tag, status, rating
- Book detail view: edit any field, change status, set rating, edit notes
- Delete a book

## Bulk Add (Desktop + USB Scanner)
For initial onboarding, Joshua will help Meg bulk-add her existing collection using a USB barcode scanner plugged into a laptop. USB scanners act as keyboard-wedge devices — they "type" the ISBN digits followed by an Enter keystroke into whatever field has focus.

- A dedicated **Bulk Add** page/mode, separate from the mobile scan-to-add flow, designed for rapid successive scans at a desk.
- An always-focused hidden/visible input that captures the scanner's keystrokes; on each Enter, it triggers the same lookup flow as mobile (Google Books → Open Library → not-found).
- Each scan appends to a running queue/list on screen (cover thumbnail, title, author) so multiple books can be scanned back-to-back without waiting on a confirm click per book.
- Duplicate-ISBN handling still applies per scan (prompt rather than silently skip or duplicate).
- Failed lookups drop into a "needs review" list at the bottom rather than blocking the scanning flow — they can be manually resolved after the scanning burst is done.
- Since this is a Joshua+Meg desktop session rather than Meg alone on her phone, this view doesn't need the same mobile polish — just needs to be fast and not lose scans.

## Non-Functional Notes
- **Mobile UI is the priority surface** — Meg will use this day-to-day on her phone, one-handed, often while holding a book up to the camera. This deserves real design attention (clean layout, big tap targets, fast scan-to-save loop), not just a functional/responsive afterthought.
- PWA-installable for a native-app feel on her phone
- Should degrade gracefully if a lookup API is down (manual entry always available)
- Desktop bulk-add view can be simpler/utilitarian — optimized for speed, not aesthetics

## Music & Movies (added after Phase 1)
Requested by Meg: track music and movies alongside books, with the same schema and location tracking.
- **Music:** CD or Record. Artist(s), year, genres, tags, rating, notes, shelf location. Lookup by barcode or
  title/artist search via MusicBrainz + Cover Art Archive.
- **Movies:** DVD or Jellyfin (digital). Director(s), year, collection, genres, tags, rating, notes. DVDs have a
  shelf location; Jellyfin items don't. DVD barcode → UPCitemdb → TMDB match; title search via TMDB.
  Jellyfin movies are added by hand (no server import).
- Library has a Books / Music / Movies switch; scan, manual add, and bulk add all work for each type.
- Statuses reuse To Read / Reading / Read, shown as To Listen / Listening / Listened and To Watch / Watching / Watched.
- Wishlists stay book-only for now.

## Phase 2 (future, not in this spec)
- Recommendations engine
- Shopping list / wishlist for books she wants but doesn't own yet (distinct from "To Read," which implies ownership)