import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Book } from "../api";
import { BookCard } from "../components/BookCard";
import { useAuth } from "../auth-context";
import { LOCATIONS } from "../constants";
import { MEDIA, type Status } from "../media";
import { MediaTypePicker } from "../components/MediaTypePicker";
import { useMediaType } from "../hooks/useMediaType";

const STATUSES: Status[] = ["to_read", "reading", "read"];

const SORT_OPTIONS = [
  { value: "created_at", label: "Date added" },
  { value: "title", label: "Title" },
  { value: "rating", label: "Rating" },
  { value: "status", label: "Status" },
  { value: "year", label: "Year" },
];

export function LibraryPage() {
  const { logout, user } = useAuth();
  const [mediaType, setMediaType] = useMediaType();
  const media = MEDIA[mediaType];
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [shelf, setShelf] = useState("");
  const [format, setFormat] = useState("");
  const [sort, setSort] = useState("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listBooks({ type: mediaType, format, q, status, shelf, sort, dir })
      .then((res) => {
        if (!cancelled) setBooks(res.books);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaType, format, q, status, shelf, sort, dir]);

  // Formats differ per media type, so a CD filter makes no sense on the Movies tab.
  useEffect(() => setFormat(""), [mediaType]);

  const allTags = useMemo(() => [...new Set(books.flatMap((b) => b.tags))].sort(), [books]);

  return (
    <div className="library-page">
      <header className="library-header">
        <div>
          <h1>Library</h1>
          <p className="library-header__subtitle">
            {books.length} {books.length === 1 ? media.noun : media.nounPlural}
            {user?.displayName ? ` · signed in as ${user.displayName}` : ""}
          </p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={() => logout()}>
          Sign out
        </button>
      </header>

      <MediaTypePicker value={mediaType} onChange={setMediaType} />

      <div className="library-controls">
        <input
          className="library-search"
          type="search"
          placeholder={`Search title, ${media.creatorLabel.replace("(s)", "").toLowerCase()}, ${media.codeLabel === "ISBN" ? "ISBN" : "barcode"}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="library-filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {media.statusLabels[s]}
              </option>
            ))}
          </select>
          {media.formats.length > 1 && (
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="">All formats</option>
              {media.formats.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
          <select value={shelf} onChange={(e) => setShelf(e.target.value)}>
            <option value="">All locations</option>
            {LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
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
          <p>No {media.nounPlural} yet.</p>
          <Link to={`/add/scan?type=${mediaType}`} className="btn btn--primary">
            Scan your first {media.noun}
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
