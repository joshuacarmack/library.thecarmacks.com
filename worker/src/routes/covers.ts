import { Hono } from "hono";
import type { Env } from "../types";
import { getCoverObject } from "../covers";

export const coverRoutes = new Hono<{ Bindings: Env }>();

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
