import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DuplicateInfo, type LookupResult, type WishlistItem } from "../api";

type AddMode = "closed" | "search" | "results" | "form";

export function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addMode, setAddMode] = useState<AddMode>("closed");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LookupResult[]>([]);
  const [alreadyOwned, setAlreadyOwned] = useState<DuplicateInfo | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [form, setForm] = useState({ isbn: "", title: "", authors: "", coverSourceUrl: "", notes: "" });

  function refresh() {
    setLoading(true);
    return api
      .listWishlist()
      .then((res) => setItems(res.items))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  function resetAddFlow() {
    setAddMode("closed");
    setQuery("");
    setResults([]);
    setAlreadyOwned(null);
    setDuplicate(null);
    setForm({ isbn: "", title: "", authors: "", coverSourceUrl: "", notes: "" });
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const { results } = await api.searchText(query.trim());
      setResults(results);
      setAddMode("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  function pickResult(result: LookupResult) {
    setForm({
      isbn: result.isbn ?? "",
      title: result.title,
      authors: result.authors.join(", "),
      coverSourceUrl: result.coverSourceUrl ?? "",
      notes: "",
    });
    setAddMode("form");
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setError(null);
    try {
      const res = await api.addToWishlist({
        isbn: form.isbn || null,
        title: form.title,
        authors: form.authors.split(",").map((a) => a.trim()).filter(Boolean),
        coverSourceUrl: form.coverSourceUrl || null,
        notes: form.notes || null,
        source: "manual",
      });
      if (res.alreadyOwned) {
        setAlreadyOwned(res.alreadyOwned);
        return;
      }
      if (res.duplicate) {
        setDuplicate(res.duplicate);
        return;
      }
      resetAddFlow();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to wishlist.");
    }
  }

  async function handleConvert(item: WishlistItem) {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await api.convertWishlistItem(item.id);
      if (res.alreadyOwned) {
        setError(`"${item.title}" turned out to already be in the library.`);
        await refresh();
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move this to the library.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(item: WishlistItem) {
    if (!confirm(`Remove "${item.title}" from the wishlist?`)) return;
    setBusyId(item.id);
    try {
      await api.removeFromWishlist(item.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="library-page">
      <header className="library-header">
        <div>
          <h1>Wishlist</h1>
          <p className="library-header__subtitle">
            {items.length} book{items.length === 1 ? "" : "s"} she wants
          </p>
        </div>
        <button className="btn btn--primary btn--sm" onClick={() => setAddMode("search")}>
          + Add
        </button>
      </header>

      {error && <p className="form-error">{error}</p>}

      {addMode !== "closed" && (
        <div className="confirm-card">
          {alreadyOwned && (
            <>
              <h2>Already in the library</h2>
              <p>"{alreadyOwned.title}" is already owned — no need to wishlist it.</p>
              <div className="confirm-actions">
                <Link to={`/books/${alreadyOwned.id}`} className="btn btn--primary">
                  View entry
                </Link>
                <button className="btn btn--ghost" onClick={resetAddFlow}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {!alreadyOwned && duplicate && (
            <>
              <h2>Already on the wishlist</h2>
              <p>"{duplicate.title}" is already there.</p>
              <button className="btn btn--ghost" onClick={resetAddFlow}>
                Cancel
              </button>
            </>
          )}

          {!alreadyOwned && !duplicate && addMode === "search" && (
            <>
              <h2>Add a wish</h2>
              <form className="auth-form" onSubmit={handleSearch}>
                <label>
                  Search by title or author
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Tomorrow, and Tomorrow, and Tomorrow" />
                </label>
                <button type="submit" className="btn btn--primary" disabled={searching}>
                  {searching ? "Searching…" : "Search"}
                </button>
              </form>
              <button className="btn btn--ghost" onClick={() => setAddMode("form")}>
                Skip search — enter details manually
              </button>
              <button className="btn btn--ghost" onClick={resetAddFlow}>
                Cancel
              </button>
            </>
          )}

          {!alreadyOwned && !duplicate && addMode === "results" && (
            <>
              <ul className="search-results">
                {results.map((r, i) => (
                  <li key={i} className="search-result" onClick={() => pickResult(r)}>
                    {r.coverSourceUrl && <img src={r.coverSourceUrl} alt="" />}
                    <div>
                      <div className="search-result__title">{r.title}</div>
                      <div className="search-result__author">{r.authors.join(", ")}</div>
                    </div>
                  </li>
                ))}
                {results.length === 0 && <p>No results. Try a different search, or enter it manually.</p>}
              </ul>
              <button className="btn btn--ghost" onClick={() => setAddMode("form")}>
                None of these — enter manually
              </button>
              <button className="btn btn--ghost" onClick={resetAddFlow}>
                Cancel
              </button>
            </>
          )}

          {!alreadyOwned && !duplicate && addMode === "form" && (
            <form className="auth-form" onSubmit={handleSave}>
              <label>
                Title *
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>
              <label>
                Author(s)
                <input
                  value={form.authors}
                  onChange={(e) => setForm({ ...form, authors: e.target.value })}
                  placeholder="Comma separated"
                />
              </label>
              <label>
                ISBN (optional)
                <input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
              </label>
              <label>
                Notes
                <textarea
                  rows={3}
                  placeholder="Why she wants it, where to find it…"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <div className="confirm-actions">
                <button type="submit" className="btn btn--primary">
                  Add to wishlist
                </button>
                <button type="button" className="btn btn--ghost" onClick={resetAddFlow}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {loading ? (
        <p className="centered-loading">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>Nothing on the wishlist yet.</p>
          <button className="btn btn--primary" onClick={() => setAddMode("search")}>
            Add the first one
          </button>
        </div>
      ) : (
        <div className="book-grid">
          {items.map((item) => (
            <div key={item.id} className="book-card wishlist-card">
              <div className="book-card__cover">
                {item.cover_url ? (
                  <img src={item.cover_url} alt="" loading="lazy" />
                ) : (
                  <div className="book-card__cover-placeholder">📖</div>
                )}
              </div>
              <div className="book-card__info">
                <div className="book-card__title">{item.title}</div>
                <div className="book-card__author">{item.authors.join(", ") || "Unknown author"}</div>
                {item.notes && <div className="wishlist-card__notes">{item.notes}</div>}
                <div className="wishlist-card__actions">
                  <button
                    className="btn btn--primary btn--sm"
                    disabled={busyId === item.id}
                    onClick={() => handleConvert(item)}
                  >
                    Got it — add to library
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    disabled={busyId === item.id}
                    onClick={() => handleRemove(item)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
