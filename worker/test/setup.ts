import { env } from "cloudflare:test";
// Vite's `?raw` suffix inlines the file as a string at bundle time — no filesystem
// access needed inside the Workers test runtime.
import initSchema from "../migrations/0001_init.sql?raw";
import wishlistSchema from "../migrations/0002_wishlist.sql?raw";
import wishlistListsSchema from "../migrations/0003_wishlist_lists.sql?raw";

// D1's local binding starts empty for every test run. `env.DB.exec()` expects one
// statement per line (it doesn't understand multi-line statements or semicolons), so
// split on `;` ourselves and run each statement individually instead.
// New migrations must be added to this list explicitly — it's not auto-discovered.
const migrations = [initSchema, wishlistSchema, wishlistListsSchema];

for (const schema of migrations) {
  const statements = schema
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}
