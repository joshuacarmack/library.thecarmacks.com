import { GENRES } from "./constants";

export type MediaType = "book" | "music" | "movie";
export type Status = "to_read" | "reading" | "read";

export interface MediaConfig {
  type: MediaType;
  tabLabel: string;
  noun: string;
  nounPlural: string;
  /** "a book" / "an album" */
  article: string;
  icon: string;
  creatorLabel: string;
  unknownCreator: string;
  /** What the `isbn` field holds for this type. */
  codeLabel: string;
  /** Allowed formats; the first is the default. Mirrored in worker/src/constants.ts MEDIA_FORMATS. */
  formats: ReadonlyArray<{ value: string; label: string }>;
  statusLabels: Record<Status, string>;
  genres: readonly string[];
  /** Label for the series fields, or null to hide them for this type. */
  seriesLabel: string | null;
  searchPlaceholder: string;
  scanHint: string;
  /** Album art is square — show it whole instead of cropping to a book shape. */
  squareCover: boolean;
}

const MUSIC_GENRES = [
  "Rock",
  "Pop",
  "Hip-Hop",
  "R&B / Soul",
  "Country",
  "Jazz",
  "Blues",
  "Classical",
  "Electronic",
  "Folk",
  "Metal",
  "Punk",
  "Indie",
  "Soundtrack",
  "Christian / Gospel",
  "Children's",
  "Holiday",
  "Other",
] as const;

const MOVIE_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "Horror",
  "Musical",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
  "Western",
  "Kids",
  "Holiday",
  "Other",
] as const;

export const MEDIA: Record<MediaType, MediaConfig> = {
  book: {
    type: "book",
    tabLabel: "Books",
    noun: "book",
    nounPlural: "books",
    article: "a book",
    icon: "📖",
    creatorLabel: "Author(s)",
    unknownCreator: "Unknown author",
    codeLabel: "ISBN",
    formats: [{ value: "physical", label: "Physical" }],
    statusLabels: { to_read: "To Read", reading: "Reading", read: "Read" },
    genres: GENRES,
    seriesLabel: "Series",
    searchPlaceholder: "e.g. Project Hail Mary",
    scanHint: "Hold the barcode on the back cover steady in the frame.",
    squareCover: false,
  },
  music: {
    type: "music",
    tabLabel: "Music",
    noun: "album",
    nounPlural: "albums",
    article: "an album",
    icon: "💿",
    creatorLabel: "Artist(s)",
    unknownCreator: "Unknown artist",
    codeLabel: "Barcode",
    formats: [
      { value: "cd", label: "CD" },
      { value: "vinyl", label: "Record" },
    ],
    statusLabels: { to_read: "To Listen", reading: "Listening", read: "Listened" },
    genres: MUSIC_GENRES,
    seriesLabel: null,
    searchPlaceholder: "e.g. Rumours Fleetwood Mac",
    scanHint: "Hold the barcode on the back of the case or sleeve steady in the frame.",
    squareCover: true,
  },
  movie: {
    type: "movie",
    tabLabel: "Movies",
    noun: "movie",
    nounPlural: "movies",
    article: "a movie",
    icon: "🎬",
    creatorLabel: "Director(s)",
    unknownCreator: "Unknown director",
    codeLabel: "Barcode",
    formats: [
      { value: "dvd", label: "DVD" },
      { value: "jellyfin", label: "Jellyfin" },
    ],
    statusLabels: { to_read: "To Watch", reading: "Watching", read: "Watched" },
    genres: MOVIE_GENRES,
    seriesLabel: "Collection",
    searchPlaceholder: "e.g. The Princess Bride",
    scanHint: "Hold the barcode on the back of the DVD case steady in the frame.",
    squareCover: false,
  },
};

export const MEDIA_TYPES: MediaType[] = ["book", "music", "movie"];

export function isMediaType(value: unknown): value is MediaType {
  return value === "book" || value === "music" || value === "movie";
}

export function formatLabel(type: MediaType, format: string): string {
  return MEDIA[type].formats.find((f) => f.value === format)?.label ?? format;
}

/** Digital formats have no physical shelf, so the location field is hidden for them. */
export function isDigitalFormat(format: string): boolean {
  return format === "jellyfin";
}

/** Formats you can scan a barcode for (i.e. not digital-only ones). */
export function physicalFormats(type: MediaType) {
  return MEDIA[type].formats.filter((f) => !isDigitalFormat(f.value));
}
