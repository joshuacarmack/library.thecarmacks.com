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
    const { books } = await list.json<{ books: unknown[] }>();
    expect(books).toHaveLength(1);

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
});
