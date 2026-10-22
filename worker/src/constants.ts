// Fixed shelf location list. Mirrored in app/src/constants.ts (no shared
// package between worker and app builds) — keep both in sync if this changes.
export const LOCATIONS = [
  "Office",
  "Living Room",
  "Bedroom",
  "Office Closet",
  "Kid's Room",
  "Basement",
  "Basement - Kid Box",
] as const;

export const MEDIA_TYPES = ["book", "music", "movie"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

// Allowed formats per media type; the first one is the default. Mirrored in
// app/src/media.ts — keep both in sync if this changes.
export const MEDIA_FORMATS: Record<MediaType, readonly string[]> = {
  book: ["physical"],
  music: ["cd", "vinyl"],
  movie: ["dvd", "jellyfin"],
};
