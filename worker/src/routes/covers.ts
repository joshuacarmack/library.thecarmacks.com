import { Hono } from "hono";
import type { Env } from "../types";
import { getCoverObject } from "../covers";
import { getUserFromRequest } from "../auth";

export const coverRoutes = new Hono<{ Bindings: Env }>();

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB — plenty for a phone cover photo

// Uploads a photo taken of a book's actual cover (manual add — no lookup
// source URL to cache from). Requires auth, unlike the GET below, which stays
// open so plain <img> tags work.
coverRoutes.post("/upload", async (c) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: "Not authenticated." }, 401);

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return c.json({ error: "Only image uploads are supported." }, 400);
  }

  const bytes = await c.req.arrayBuffer();
  if (!bytes.byteLength) return c.json({ error: "Empty upload." }, 400);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: "Image is too large (max 8MB)." }, 400);
  }

  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const key = `covers/${crypto.randomUUID()}.${ext}`;
  await c.env.COVERS.put(key, bytes, { httpMetadata: { contentType } });
  return c.json({ url: `/api/covers/${key.replace("covers/", "")}` }, 201);
});

coverRoutes.get("/:filename", async (c) => {
  const object = await getCoverObject(c.env, c.req.param("filename"));
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: object.httpEtag,
    },
  });
});
