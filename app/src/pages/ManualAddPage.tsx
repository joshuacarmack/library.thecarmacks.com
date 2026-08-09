import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type DuplicateInfo, type LookupResult } from "../api";
import { GENRES, LOCATIONS } from "../constants";

type Mode = "search" | "results" | "form";

export function ManualAddPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prefillIsbn = params.get("isbn") ?? "";

  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    isbn: prefillIsbn,
    title: "",
    authors: "",
    coverSourceUrl: "",
    genres: [] as string[],
    seriesName: "",
    seriesNumber: "",
    notes: "",
    shelfLocation: "",
  });

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const { results } = await api.searchText(query.trim());
      setResults(results);
      setMode("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  function pickResult(result: LookupResult) {
    setForm((f) => ({
      ...f,
      isbn: result.isbn ?? "",
      title: result.title,
      authors: result.authors.join(", "),
      coverSourceUrl: result.coverSourceUrl ?? "",
    }));
    setMode("form");
  }

  async function handleSave(e: FormEvent, allowDuplicate = false) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.createBook({
        isbn: form.isbn || null,
        title: form.title,
        authors: form.authors.split(",").map((a) => a.trim()).filter(Boolean),
        coverSourceUrl: form.coverSourceUrl || null,
        genres: form.genres,
        seriesName: form.seriesName || null,
        seriesNumber: form.seriesNumber ? Number(form.seriesNumber) : null,
        notes: form.notes || null,
        shelfLocation: form.shelfLocation || null,
        source: "manual",
        allowDuplicate,
      });
      if (res.duplicate) {
        setDuplicate(res.duplicate);
        return;
      }
      navigate(`/books/${res.book.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save book.");
    }
  }

  return (
    <div className="manual-add-page">
      <h1>Add a book</h1>
      {error && <p className="form-error">{error}</p>}

      {duplicate && (
        <div className="confirm-card">
          <h2>You already have this book</h2>
          <p>"{duplicate.title}" is already in the library.</p>
          <div className="confirm-actions">
            <button className="btn btn--primary" onClick={() => navigate(`/books/${duplicate.id}`)}>
              View existing entry
            </button>
            <button className="btn btn--ghost" onClick={(e) => handleSave(e as unknown as FormEvent, true)}>
              Add another copy anyway
            </button>
            <button className="btn btn--ghost" onClick={() => setDuplicate(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!duplicate && mode === "search" && (
        <>
          <form className="auth-form" onSubmit={handleSearch}>
            <label>
              Search by title or author
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Project Hail Mary" />
            </label>
            <button type="submit" className="btn btn--primary" disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
          <button className="btn btn--ghost" onClick={() => setMode("form")}>
            Skip search — enter details manually
          </button>
        </>
      )}

      {!duplicate && mode === "results" && (
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
            {results.length === 0 && <p>No results. Try a different search, or enter the book manually.</p>}
          </ul>
          <button className="btn btn--ghost" onClick={() => setMode("form")}>
            None of these — enter manually
          </button>
        </>
      )}

      {!duplicate && mode === "form" && (
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
          <fieldset>
            <legend>Genres</legend>
            <div className="genre-grid">
              {GENRES.map((g) => {
                const active = form.genres.includes(g);
                return (
                  <button
                    type="button"
                    key={g}
                    className={"tag-chip" + (active ? " tag-chip--active" : "")}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        genres: active ? f.genres.filter((x) => x !== g) : [...f.genres, g],
                      }))
                    }
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="series-row">
            <label>
              Series name
              <input value={form.seriesName} onChange={(e) => setForm({ ...form, seriesName: e.target.value })} />
            </label>
            <label>
              Series #
              <input
                type="number"
                value={form.seriesNumber}
                onChange={(e) => setForm({ ...form, seriesNumber: e.target.value })}
              />
            </label>
          </div>
          <label>
            Shelf location
            <select value={form.shelfLocation} onChange={(e) => setForm({ ...form, shelfLocation: e.target.value })}>
              <option value="">Unset</option>
              {LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button type="submit" className="btn btn--primary">
            Save book
          </button>
        </form>
      )}
    </div>
  );
}
