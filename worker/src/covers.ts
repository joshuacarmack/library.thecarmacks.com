import type { Env } from "./types";

/**
 * Downloads a cover image from a source API and caches it in R2.
 * Returns the internal app URL to store on the book record (never the source URL).
 */
export async function cacheCoverImage(env: Env, sourceUrl: string, bookId: string): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok || !res.body) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const key = `covers/${bookId}.${ext}`;
    await env.COVERS.put(key, res.body, {
      httpMetadata: { contentType },
    });
    return `/api/covers/${key.replace("covers/", "")}`;
  } catch {
    return null;
  }
}

export async function getCoverObject(env: Env, filename: string): Promise<R2ObjectBody | null> {
  const key = `covers/${filename}`;
  return env.COVERS.get(key);
}
