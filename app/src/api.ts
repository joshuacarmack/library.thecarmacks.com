export interface Book {
  id: string;
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
  source: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LookupResult {
  isbn: string | null;
  title: string;
  authors: string[];
  coverSourceUrl: string | null;
  source: "google_books" | "open_library";
}

export interface DuplicateInfo {
  id: string;
  title: string;
  cover_url: string | null;
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

  lookupIsbn: (isbn: string) =>
    request<{ found: boolean; result: LookupResult | null; duplicate: DuplicateInfo | null; validChecksum: boolean }>(
      `/lookup/isbn/${encodeURIComponent(isbn)}`
    ),
  searchText: (q: string) => request<{ results: LookupResult[] }>(`/lookup/search?q=${encodeURIComponent(q)}`),

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
};
