import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type DuplicateInfo, type LookupResult } from "../api";
import { LOCATIONS } from "../constants";
import { MEDIA, isDigitalFormat } from "../media";
import { MediaTypePicker } from "../components/MediaTypePicker";
import { useMediaType } from "../hooks/useMediaType";

type Mode = "search" | "results" | "form";

export function ManualAddPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prefillIsbn = params.get("isbn") ?? "";
  const [mediaType, setMediaType] = useMediaType();
  const media = MEDIA[mediaType];
  const [searchNotice, setSearchNotice] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [form, setForm] = useState({
    isbn: prefillIsbn,
    title: "",
    authors: "",
    coverSourceUrl: "",
    format: media.formats[0].value,
    year: "",
    genres: [] as string[],
    seriesName: "",
    seriesNumber: "",
    notes: "",
    shelfLocation: "",
  });

  // Switching Books/Music/Movies mid-way: genres and formats don't carry over between types.
  useEffect(() => {
    setForm((f) => ({ ...f, format: MEDIA[mediaType].formats[0].value, genres: [] }));
    setResults([]);
    setSearchNotice(null);
    setMode((m) => (m === "results" ? "search" : m));
  }, [mediaType]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const { results, unavailable } = await api.searchText(query.trim(), mediaType);
      setResults(results);
      setSearchNotice(unavailable ?? null);
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
      year: result.year ? String(result.year) : "",
      format: result.format && media.formats.some((fm) => fm.value === result.format) ? result.format : f.format,
    }));
    setCoverPhotoUrl(null); // a fresh pick replaces any photo taken for a previous attempt
    setMode("form");
  }

  async function handleCoverFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file if they retake the photo
    if (!file) return;
    setError(null);
    setUploadingCover(true);
    try {
      const { url } = await api.uploadCoverPhoto(file);
      setCoverPhotoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload photo.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleSave(e: FormEvent, allowDuplicate = false) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.createBook({
        mediaType,
        format: form.format,
        year: form.year ? Number(form.year) : null,
        isbn: (!isDigitalFormat(form.format) && form.isbn) || null,
        title: form.title,
        authors: form.authors.split(",").map((a) => a.trim()).filter(Boolean),
        coverSourceUrl: form.coverSourceUrl || null,
        coverUrl: coverPhotoUrl,
        genres: form.genres,
        seriesName: (media.seriesLabel && form.seriesName) || null,
        seriesNumber: media.seriesLabel && form.seriesNumber ? Number(form.seriesNumber) : null,
        notes: form.notes || null,
        shelfLocation: (!isDigitalFormat(form.format) && form.shelfLocation) || null,
        source: "manual",
        allowDuplicate,
      });
      if (res.duplicate) {
        setDuplicate(res.duplicate);
        return;
      }
      navigate(`/books/${res.book.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not save ${media.noun}.`);
    }
  }

  return (
    <div className="manual-add-page">
      <h1>Add {media.article}</h1>
      {!duplicate && <MediaTypePicker value={mediaType} onChange={setMediaType} />}
      {error && <p className="form-error">{error}</p>}

      {duplicate && (
        <div className="confirm-card">
          <h2>You already have this {media.noun}</h2>
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
              Search by title or {media.creatorLabel.replace("(s)", "").toLowerCase()}
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={media.searchPlaceholder} />
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
                {r.coverSourceUrl && (
                  <img
                    src={r.coverSourceUrl}
                    alt=""
                    // Cover Art Archive doesn't have art for every album, so hide the broken image.
                    onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                  />
                )}
                <div>
                  <div className="search-result__title">{r.title}</div>
                  <div className="search-result__author">
                    {r.authors.join(", ")}
                    {r.year ? ` · ${r.year}` : ""}
                  </div>
                </div>
              </li>
            ))}
            {results.length === 0 && (
              <p>{searchNotice ?? `No results. Try a different search, or enter the ${media.noun} manually.`}</p>
            )}
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
          {media.formats.length > 1 && (
            <div className="status-toggle">
              {media.formats.map((f) => (
                <button
                  type="button"
                  key={f.value}
                  className={"status-toggle__btn" + (form.format === f.value ? " status-toggle__btn--active" : "")}
                  onClick={() => setForm({ ...form, format: f.value })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <label>
            {media.creatorLabel}
            <input
              value={form.authors}
              onChange={(e) => setForm({ ...form, authors: e.target.value })}
              placeholder="Comma separated"
            />
          </label>
          {mediaType !== "book" && (
            <label>
              Year (optional)
              <input
                type="number"
                inputMode="numeric"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
            </label>
          )}
          {!isDigitalFormat(form.format) && (
            <label>
              {media.codeLabel} (optional)
              <input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
            </label>
          )}
          <label>
            Cover photo (optional)
            <input type="file" accept="image/*" capture="environment" onChange={handleCoverFileChange} />
          </label>
          {uploadingCover && <p className="scan-hint">Uploading photo…</p>}
          {(coverPhotoUrl || form.coverSourceUrl) && (
            <div className="cover-photo-preview">
              <img src={coverPhotoUrl || form.coverSourceUrl} alt="" className="confirm-cover" />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setCoverPhotoUrl(null);
                  setForm((f) => ({ ...f, coverSourceUrl: "" }));
                }}
              >
                Remove photo
              </button>
            </div>
          )}
          <fieldset>
            <legend>Genres</legend>
            <div className="genre-grid">
              {media.genres.map((g) => {
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
          {media.seriesLabel && (
            <div className="series-row">
              <label>
                {media.seriesLabel} name
                <input value={form.seriesName} onChange={(e) => setForm({ ...form, seriesName: e.target.value })} />
              </label>
              <label>
                {media.seriesLabel} #
                <input
                  type="number"
                  value={form.seriesNumber}
                  onChange={(e) => setForm({ ...form, seriesNumber: e.target.value })}
                />
              </label>
            </div>
          )}
          {!isDigitalFormat(form.format) && (
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
          )}
          <label>
            Notes
            <textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button type="submit" className="btn btn--primary">
            Save {media.noun}
          </button>
        </form>
      )}
    </div>
  );
}
