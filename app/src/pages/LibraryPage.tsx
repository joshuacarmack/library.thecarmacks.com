import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Book } from "../api";
import { BookCard } from "../components/BookCard";
import { useAuth } from "../auth-context";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "to_read", label: "To Read" },
  { value: "reading", label: "Reading" },
  { value: "read", label: "Read" },
];

const SORT_OPTIONS = [
  { value: "created_at", label: "Date added" },
  { value: "title", label: "Title" },
  { value: "rating", label: "Rating" },
  { value: "status", label: "Status" },
];

export function LibraryPage() {
  const { logout, user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listBooks({ q, status, sort, dir })
      .then((res) => {
        if (!cancelled) setBooks(res.books);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, status, sort, dir]);

  const allTags = useMemo(() => [...new Set(books.flatMap((b) => b.tags))].sort(), [books]);

  return (
    <div className="library-page">
      <header className="library-header">
        <div>
          <h1>Library</h1>
          <p className="library-header__subtitle">
            {books.length} book{books.length === 1 ? "" : "s"}
            {user?.displayName ? ` · signed in as ${user.displayName}` : ""}
          </p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={() => logout()}>
          Sign out
        </button>
      </header>

      <div className="library-controls">
        <input
          className="library-search"
          type="search"
          placeholder="Search title, author, ISBN…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="library-filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label="Toggle sort direction"
          >
            {dir === "asc" ? "↑" : "↓"}
          </button>
        </div>
        {allTags.length > 0 && (
          <div className="library-tags">
            {allTags.slice(0, 12).map((tag) => (
              <button key={tag} className="tag-chip" onClick={() => setQ(tag)}>
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="centered-loading">Loading…</p>
      ) : books.length === 0 ? (
        <div className="empty-state">
          <p>No books yet.</p>
          <Link to="/add/scan" className="btn btn--primary">
            Scan your first book
          </Link>
        </div>
      ) : (
        <div className="book-grid">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}
