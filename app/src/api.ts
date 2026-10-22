import type { MediaType } from "./media";

export interface Book {
  id: string;
  media_type: MediaType;
  isbn: string | null;
  title: string;
  authors: string[];
  cover_url: string | null;
  status: "to_read" | "reading" | "read";
  rating: number | null;
  genres: string[];
  tags: string[];
  series_name: string | null;
  series_number: number | null;
  notes: string | null;
  shelf_location: string | null;
  format: string;
  year: number | null;
  source: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LookupResult {
  /** ISBN for books; UPC/EAN barcode for music and movies. */
  isbn: string | null;
  title: string;
  /** Authors, artists, or directors depending on media type. */
  authors: string[];
  coverSourceUrl: string | null;
  year?: number | null;
  format?: string | null;
  source: "google_books" | "open_library" | "musicbrainz" | "tmdb" | "upcitemdb";
}

export type LookupResponse = {
  found: boolean;
  result: LookupResult | null;
  duplicate: DuplicateInfo | null;
  validChecksum: boolean;
};

export interface DuplicateInfo {
  id: string;
  title: string;
  cover_url: string | null;
}

export interface WishlistItem {
  id: string;
  wishlist_id: string;
  isbn: string | null;
  title: string;
  authors: string[];
  cover_url: string | null;
  notes: string | null;
  source: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Wishlist {
  id: string;
  name: string;
  item_count: number;
  is_public: boolean;
  share_token: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicWishlistItem {
  id: string;
  isbn: string | null;
  title: string;
  authors: string[];
  cover_url: string | null;
  notes: string | null;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError((data as { error?: string })?.error ?? res.statusText, res.status);
  }
  return data as T;
}

export { ApiError };

export const api = {
  me: () => request<{ id: string; email: string; display_name: string | null }>("/auth/me"),
  login: (email: string, password: string) =>
    request<{ id: string; email: string; displayName: string | null }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signup: (email: string, password: string, displayName: string, signupCode?: string) =>
    request<{ id: string; email: string; displayName: string | null }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName, signupCode }),
    }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  lookupIsbn: (isbn: string) => request<LookupResponse>(`/lookup/isbn/${encodeURIComponent(isbn)}`),
  /** CD / record / DVD barcode lookup. */
  lookupBarcode: (code: string, type: "music" | "movie") =>
    request<LookupResponse>(`/lookup/barcode/${encodeURIComponent(code)}?type=${type}`),
  /** Books use ISBN, music/movies use product barcodes — picks the right endpoint. */
  lookupCode: (code: string, type: MediaType): Promise<LookupResponse> =>
    type === "book" ? api.lookupIsbn(code) : api.lookupBarcode(code, type),
  searchText: (q: string, type: MediaType = "book") =>
    request<{ results: LookupResult[]; unavailable?: string }>(
      `/lookup/search?q=${encodeURIComponent(q)}&type=${type}`
    ),

  /** Uploads a photo of a book's actual cover (manual add). Returns the cached /api/covers/... URL. */
  uploadCoverPhoto: async (file: Blob): Promise<{ url: string }> => {
    const res = await fetch("/api/covers/upload", {
      method: "POST",
      headers: { "Content-Type": file.type || "image/jpeg" },
      credentials: "include",
      body: file,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new ApiError((data as { error?: string })?.error ?? res.statusText, res.status);
    }
    return data as { url: string };
  },

  listBooks: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => !!v) as [string, string][]);
    return request<{ books: Book[] }>(`/books?${qs.toString()}`);
  },
  getBook: (id: string) => request<{ book: Book }>(`/books/${id}`),
  /** 409 (duplicate ISBN) is a normal outcome here, not an error — resolved instead of thrown. */
  createBook: async (
    payload: Record<string, unknown>
  ): Promise<{ book: Book; duplicate?: undefined } | { book?: undefined; duplicate: DuplicateInfo }> => {
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok && res.status !== 409) {
      throw new ApiError((data as { error?: string })?.error ?? res.statusText, res.status);
    }
    return data;
  },
  updateBook: (id: string, payload: Record<string, unknown>) =>
    request<{ book: Book }>(`/books/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteBook: (id: string) => request<{ ok: true }>(`/books/${id}`, { method: "DELETE" }),

  listWishlists: () => request<{ wishlists: Wishlist[] }>("/wishlists"),
  createWishlist: (name: string) =>
    request<{ wishlist: Wishlist }>("/wishlists", { method: "POST", body: JSON.stringify({ name }) }),
  renameWishlist: (id: string, name: string) =>
    request<{ wishlist: Wishlist }>(`/wishlists/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  setWishlistPublic: (id: string, isPublic: boolean) =>
    request<{ wishlist: Wishlist }>(`/wishlists/${id}`, { method: "PATCH", body: JSON.stringify({ isPublic }) }),
  deleteWishlist: (id: string) => request<{ ok: true }>(`/wishlists/${id}`, { method: "DELETE" }),

  /** Unauthenticated — the public read-only view behind a shared link. */
  getPublicWishlist: (token: string) =>
    request<{ name: string; items: PublicWishlistItem[] }>(`/public/wishlists/${encodeURIComponent(token)}`),

  listWishlist: (wishlistId: string, q?: string) => {
    const params = new URLSearchParams({ wishlistId, ...(q ? { q } : {}) });
    return request<{ items: WishlistItem[] }>(`/wishlist?${params.toString()}`);
  },
  /** 409 (already owned, or already on the wishlist) is a normal outcome here, not an error. */
  addToWishlist: async (
    payload: Record<string, unknown>
  ): Promise<
    | { item: WishlistItem; alreadyOwned?: undefined; duplicate?: undefined }
    | { item?: undefined; alreadyOwned: DuplicateInfo; duplicate?: undefined }
    | { item?: undefined; alreadyOwned?: undefined; duplicate: DuplicateInfo }
  > => {
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok && res.status !== 409) {
      throw new ApiError((data as { error?: string })?.error ?? res.statusText, res.status);
    }
    return data;
  },
  updateWishlistItem: (id: string, payload: Record<string, unknown>) =>
    request<{ item: WishlistItem }>(`/wishlist/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  removeFromWishlist: (id: string) => request<{ ok: true }>(`/wishlist/${id}`, { method: "DELETE" }),
  /** 409 (already owned) is a normal outcome here, not an error. */
  convertWishlistItem: async (
    id: string
  ): Promise<{ book: Book; alreadyOwned?: undefined } | { book?: undefined; alreadyOwned: DuplicateInfo }> => {
    const res = await fetch(`/api/wishlist/${id}/convert`, { method: "POST", credentials: "include" });
    const data = await res.json();
    if (!res.ok && res.status !== 409) {
      throw new ApiError((data as { error?: string })?.error ?? res.statusText, res.status);
    }
    return data;
  },
};
