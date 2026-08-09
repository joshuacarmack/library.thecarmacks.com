import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

/** Extracts the Set-Cookie session header so subsequent requests can act as the same user. */
function sessionCookieFrom(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("Expected a Set-Cookie header on the response");
  return setCookie.split(";")[0];
}

async function signUp(email: string, password = "correcthorse1"): Promise<string> {
  const res = await SELF.fetch("https://library.test/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Test User" }),
  });
  expect(res.status).toBe(200);
  return sessionCookieFrom(res);
}

describe("health", () => {
  it("reports ok with no auth required when D1 and R2 are reachable", async () => {
    const res = await SELF.fetch("https://library.test/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json<{ status: string; checks: Record<string, string> }>();
    expect(body.status).toBe("ok");
    expect(body.checks.database).toBe("ok");
    expect(body.checks.covers).toBe("ok");
  });
});

describe("auth", () => {
  it("rejects an unknown route under /api with JSON, not the SPA shell", async () => {
    const res = await SELF.fetch("https://library.test/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("signs up, then rejects a duplicate email", async () => {
    await signUp("dup@example.com");
    const res = await SELF.fetch("https://library.test/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com", password: "correcthorse1" }),
    });
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await signUp("login@example.com", "correcthorse1");
    const good = await SELF.fetch("https://library.test/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "login@example.com", password: "correcthorse1" }),
    });
    expect(good.status).toBe(200);

    const bad = await SELF.fetch("https://library.test/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "login@example.com", password: "wrong" }),
    });
    expect(bad.status).toBe(401);
  });

  it("logging out invalidates the session", async () => {
    const cookie = await signUp("logout@example.com");
    await SELF.fetch("https://library.test/api/auth/logout", { method: "POST", headers: { Cookie: cookie } });
    const me = await SELF.fetch("https://library.test/api/auth/me", { headers: { Cookie: cookie } });
    expect(me.status).toBe(401);
  });
});

// 1x1 transparent PNG — enough to exercise the upload path without a real cover photo.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
function tinyPngBytes(): Uint8Array {
  const binary = atob(TINY_PNG_BASE64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

describe("cover uploads (manual photo)", () => {
  let cookie: string;

  beforeEach(async () => {
    cookie = await signUp(`covers-${crypto.randomUUID()}@example.com`);
  });

  it("requires authentication", async () => {
    const res = await SELF.fetch("https://library.test/api/covers/upload", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: tinyPngBytes(),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a non-image upload", async () => {
    const res = await SELF.fetch("https://library.test/api/covers/upload", {
      method: "POST",
      headers: { "Content-Type": "text/plain", Cookie: cookie },
      body: "not an image",
    });
    expect(res.status).toBe(400);
  });

  it("uploads an image and the returned URL can be used directly as a book's cover", async () => {
    const upload = await SELF.fetch("https://library.test/api/covers/upload", {
      method: "POST",
      headers: { "Content-Type": "image/png", Cookie: cookie },
      body: tinyPngBytes(),
    });
    expect(upload.status).toBe(201);
    const { url } = await upload.json<{ url: string }>();
    expect(url).toMatch(/^\/api\/covers\//);

    // The uploaded file is fetchable...
    const fetched = await SELF.fetch(`https://library.test${url}`);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-type")).toBe("image/png");

    // ...and using it as coverUrl on create stores it as-is, no re-fetch/re-cache.
    const create = await SELF.fetch("https://library.test/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Photographed Book", coverUrl: url }),
    });
    expect(create.status).toBe(201);
    const { book } = await create.json<{ book: { cover_url: string | null } }>();
    expect(book.cover_url).toBe(url);
  });
});

describe("books API", () => {
  let cookie: string;

  beforeEach(async () => {
    cookie = await signUp(`books-${crypto.randomUUID()}@example.com`);
  });

  it("requires authentication", async () => {
    const res = await SELF.fetch("https://library.test/api/books");
    expect(res.status).toBe(401);
  });

  it("creates, lists, updates, and deletes a book", async () => {
    const create = await SELF.fetch("https://library.test/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Test Driven Development", authors: ["Kent Beck"] }),
    });
    expect(create.status).toBe(201);
    const { book } = await create.json<{ book: { id: string; status: string } }>();
    expect(book.status).toBe("to_read");

    const list = await SELF.fetch("https://library.test/api/books", { headers: { Cookie: cookie } });
    const { books } = await list.json<{ books: Array<{ id: string }> }>();
    expect(books.some((b) => b.id === book.id)).toBe(true);

    const patch = await SELF.fetch(`https://library.test/api/books/${book.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ status: "read", rating: 5 }),
    });
    expect(patch.status).toBe(200);
    const patched = await patch.json<{ book: { status: string; rating: number } }>();
    expect(patched.book.status).toBe("read");
    expect(patched.book.rating).toBe(5);

    const del = await SELF.fetch(`https://library.test/api/books/${book.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(del.status).toBe(200);

    const getAfterDelete = await SELF.fetch(`https://library.test/api/books/${book.id}`, { headers: { Cookie: cookie } });
    expect(getAfterDelete.status).toBe(404);
  });

  it("flags a duplicate ISBN instead of silently creating or blocking", async () => {
    const isbn = "9780593135204";
    const first = await SELF.fetch("https://library.test/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Project Hail Mary", isbn }),
    });
    expect(first.status).toBe(201);

    const second = await SELF.fetch("https://library.test/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Project Hail Mary", isbn }),
    });
    expect(second.status).toBe(409);
    const body = await second.json<{ duplicate: { title: string } }>();
    expect(body.duplicate.title).toBe("Project Hail Mary");

    // Explicitly allowing the duplicate should still succeed (e.g. a second physical copy).
    const third = await SELF.fetch("https://library.test/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Project Hail Mary", isbn, allowDuplicate: true }),
    });
    expect(third.status).toBe(201);
  });

  it("filters by status and sorts by title", async () => {
    for (const [title, status] of [
      ["Zebra Book", "to_read"],
      ["Apple Book", "reading"],
      ["Mango Book", "reading"],
    ] as const) {
      await SELF.fetch("https://library.test/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ title, status }),
      });
    }

    const filtered = await SELF.fetch("https://library.test/api/books?status=reading&sort=title&dir=asc", {
      headers: { Cookie: cookie },
    });
    const { books } = await filtered.json<{ books: Array<{ title: string }> }>();
    expect(books.map((b) => b.title)).toEqual(["Apple Book", "Mango Book"]);
  });

  it("sets shelf location on create, updates it via PATCH, and filters/searches by it", async () => {
    const create = await SELF.fetch("https://library.test/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Shelved Book", shelfLocation: "Living Room" }),
    });
    expect(create.status).toBe(201);
    const { book } = await create.json<{ book: { id: string; shelf_location: string | null } }>();
    expect(book.shelf_location).toBe("Living Room");

    const patch = await SELF.fetch(`https://library.test/api/books/${book.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ shelfLocation: "Office" }),
    });
    const patched = await patch.json<{ book: { shelf_location: string | null } }>();
    expect(patched.book.shelf_location).toBe("Office");

    const byShelf = await SELF.fetch("https://library.test/api/books?shelf=Office", { headers: { Cookie: cookie } });
    const { books: shelfMatches } = await byShelf.json<{ books: Array<{ id: string }> }>();
    expect(shelfMatches.some((b) => b.id === book.id)).toBe(true);

    const bySearch = await SELF.fetch("https://library.test/api/books?q=Office", { headers: { Cookie: cookie } });
    const { books: searchMatches } = await bySearch.json<{ books: Array<{ id: string }> }>();
    expect(searchMatches.some((b) => b.id === book.id)).toBe(true);
  });

  it("rejects a shelf location outside the fixed list, on both create and update", async () => {
    const create = await SELF.fetch("https://library.test/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Freeform Attempt", shelfLocation: "Attic" }),
    });
    expect(create.status).toBe(400);

    const ok = await SELF.fetch("https://library.test/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Valid Location Book", shelfLocation: "Basement" }),
    });
    expect(ok.status).toBe(201);
    const { book } = await ok.json<{ book: { id: string } }>();

    const patch = await SELF.fetch(`https://library.test/api/books/${book.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ shelfLocation: "Attic" }),
    });
    expect(patch.status).toBe(400);
  });
});

/** Creates a named wishlist and returns its id. */
async function createWishlist(cookie: string, name: string): Promise<string> {
  const res = await SELF.fetch("https://library.test/api/wishlists", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(201);
  const { wishlist } = await res.json<{ wishlist: { id: string } }>();
  return wishlist.id;
}

describe("wishlists API (the named lists themselves)", () => {
  let cookie: string;

  beforeEach(async () => {
    cookie = await signUp(`wishlists-${crypto.randomUUID()}@example.com`);
  });

  it("requires authentication", async () => {
    const res = await SELF.fetch("https://library.test/api/wishlists");
    expect(res.status).toBe(401);
  });

  it("creates, lists (with item counts), renames, and deletes a wishlist", async () => {
    const id = await createWishlist(cookie, `Birthday ideas ${crypto.randomUUID()}`);

    await SELF.fetch("https://library.test/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ wishlistId: id, title: "Some Book" }),
    });

    const list = await SELF.fetch("https://library.test/api/wishlists", { headers: { Cookie: cookie } });
    const { wishlists } = await list.json<{ wishlists: Array<{ id: string; item_count: number }> }>();
    const found = wishlists.find((w) => w.id === id);
    expect(found?.item_count).toBe(1);

    const rename = await SELF.fetch(`https://library.test/api/wishlists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Renamed List" }),
    });
    expect(rename.status).toBe(200);
    const { wishlist: renamed } = await rename.json<{ wishlist: { name: string } }>();
    expect(renamed.name).toBe("Renamed List");

    const del = await SELF.fetch(`https://library.test/api/wishlists/${id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(del.status).toBe(200);

    // Deleting a list deletes its items too.
    const itemsAfter = await SELF.fetch(`https://library.test/api/wishlist?wishlistId=${id}`, {
      headers: { Cookie: cookie },
    });
    const { items } = await itemsAfter.json<{ items: unknown[] }>();
    expect(items).toHaveLength(0);
  });

  it("rejects a duplicate list name (case-insensitive)", async () => {
    const name = `Book club ${crypto.randomUUID()}`;
    await createWishlist(cookie, name);
    const second = await SELF.fetch("https://library.test/api/wishlists", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: name.toUpperCase() }),
    });
    expect(second.status).toBe(409);
  });
});

describe("wishlist items API", () => {
  let cookie: string;
  let wishlistId: string;

  beforeEach(async () => {
    cookie = await signUp(`wishlist-${crypto.randomUUID()}@example.com`);
    wishlistId = await createWishlist(cookie, `Someday ${crypto.randomUUID()}`);
  });

  it("requires authentication", async () => {
    const res = await SELF.fetch(`https://library.test/api/wishlist?wishlistId=${wishlistId}`);
    expect(res.status).toBe(401);
  });

  it("requires a wishlistId to list or create items", async () => {
    const list = await SELF.fetch("https://library.test/api/wishlist", { headers: { Cookie: cookie } });
    expect(list.status).toBe(400);

    const create = await SELF.fetch("https://library.test/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "No list specified" }),
    });
    expect(create.status).toBe(400);
  });

  it("adds, lists, updates, and removes a wishlist item", async () => {
    const create = await SELF.fetch("https://library.test/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        wishlistId,
        title: "Tomorrow, and Tomorrow, and Tomorrow",
        authors: ["Gabrielle Zevin"],
      }),
    });
    expect(create.status).toBe(201);
    const { item } = await create.json<{ item: { id: string; wishlist_id: string; authors: string[] } }>();
    expect(item.authors).toEqual(["Gabrielle Zevin"]);
    expect(item.wishlist_id).toBe(wishlistId);

    const list = await SELF.fetch(`https://library.test/api/wishlist?wishlistId=${wishlistId}`, {
      headers: { Cookie: cookie },
    });
    const { items } = await list.json<{ items: unknown[] }>();
    expect(items).toHaveLength(1);

    const patch = await SELF.fetch(`https://library.test/api/wishlist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ notes: "birthday idea" }),
    });
    expect(patch.status).toBe(200);
    const patched = await patch.json<{ item: { notes: string } }>();
    expect(patched.item.notes).toBe("birthday idea");

    const del = await SELF.fetch(`https://library.test/api/wishlist/${item.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(del.status).toBe(200);

    const listAfterDelete = await SELF.fetch(`https://library.test/api/wishlist?wishlistId=${wishlistId}`, {
      headers: { Cookie: cookie },
    });
    const { items: itemsAfterDelete } = await listAfterDelete.json<{ items: unknown[] }>();
    expect(itemsAfterDelete).toHaveLength(0);
  });

  it("moves an item to a different list via PATCH", async () => {
    const otherListId = await createWishlist(cookie, `Book club ${crypto.randomUUID()}`);

    const create = await SELF.fetch("https://library.test/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ wishlistId, title: "Movable Book" }),
    });
    const { item } = await create.json<{ item: { id: string } }>();

    const move = await SELF.fetch(`https://library.test/api/wishlist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ wishlistId: otherListId }),
    });
    expect(move.status).toBe(200);
    const { item: moved } = await move.json<{ item: { wishlist_id: string } }>();
    expect(moved.wishlist_id).toBe(otherListId);
  });

  it("allows the same ISBN on two different lists, but not twice on the same list", async () => {
    const isbn = "9780316556347";
    const otherListId = await createWishlist(cookie, `Book club ${crypto.randomUUID()}`);

    const first = await SELF.fetch("https://library.test/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ wishlistId, title: "Project Hail Mary", isbn }),
    });
    expect(first.status).toBe(201);

    const sameListAgain = await SELF.fetch("https://library.test/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ wishlistId, title: "Project Hail Mary", isbn }),
    });
    expect(sameListAgain.status).toBe(409);
    const body = await sameListAgain.json<{ duplicate: { title: string } }>();
    expect(body.duplicate.title).toBe("Project Hail Mary");

    const otherList = await SELF.fetch("https://library.test/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ wishlistId: otherListId, title: "Project Hail Mary", isbn }),
    });
    expect(otherList.status).toBe(201);
  });

  it("refuses to wishlist an ISBN that's already owned", async () => {
    const isbn = "9780345339683";
    const owned = await SELF.fetch("https://library.test/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Project Hail Mary", isbn }),
    });
    expect(owned.status).toBe(201);

    const wish = await SELF.fetch("https://library.test/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ wishlistId, title: "Project Hail Mary", isbn }),
    });
    expect(wish.status).toBe(409);
    const body = await wish.json<{ alreadyOwned: { title: string } }>();
    expect(body.alreadyOwned.title).toBe("Project Hail Mary");
  });

  it("converts a wishlist item into an owned book and removes it from the wishlist", async () => {
    const create = await SELF.fetch("https://library.test/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        wishlistId,
        title: "Klara and the Sun",
        authors: ["Kazuo Ishiguro"],
        notes: "she mentioned this",
      }),
    });
    const { item } = await create.json<{ item: { id: string } }>();

    const convert = await SELF.fetch(`https://library.test/api/wishlist/${item.id}/convert`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(convert.status).toBe(201);
    const { book } = await convert.json<{
      book: { id: string; title: string; status: string; authors: string[]; notes: string };
    }>();
    expect(book.title).toBe("Klara and the Sun");
    expect(book.status).toBe("to_read");
    expect(book.authors).toEqual(["Kazuo Ishiguro"]);
    expect(book.notes).toBe("she mentioned this");

    // Gone from the wishlist...
    const list = await SELF.fetch(`https://library.test/api/wishlist?wishlistId=${wishlistId}`, {
      headers: { Cookie: cookie },
    });
    const { items } = await list.json<{ items: Array<{ id: string }> }>();
    expect(items.some((i) => i.id === item.id)).toBe(false);

    // ...and present in the real library.
    const getBook = await SELF.fetch(`https://library.test/api/books/${book.id}`, { headers: { Cookie: cookie } });
    expect(getBook.status).toBe(200);
  });

  it("returns 404 converting a wishlist item that doesn't exist", async () => {
    const res = await SELF.fetch(`https://library.test/api/wishlist/${crypto.randomUUID()}/convert`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(404);
  });
});
