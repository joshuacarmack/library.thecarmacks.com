import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Book } from "../api";
import { StarRating } from "../components/StarRating";
import { LOCATIONS } from "../constants";
import { MEDIA, isDigitalFormat, type Status } from "../media";

const STATUSES: Status[] = ["to_read", "reading", "read"];

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .getBook(id)
      .then((res) => setBook(res.book))
      .finally(() => setLoading(false));
  }, [id]);

  async function save(patch: Record<string, unknown>) {
    if (!id) return;
    setSaving(true);
    try {
      const res = await api.updateBook(id, patch);
      setBook(res.book);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || !book) return;
    if (!confirm(`Delete "${book.title}" from the library? This can't be undone.`)) return;
    await api.deleteBook(id);
    navigate("/");
  }

  if (loading) return <p className="centered-loading">Loading…</p>;
  if (!book) return <p className="centered-loading">Not found.</p>;

  const media = MEDIA[book.media_type] ?? MEDIA.book;

  return (
    <div className="book-detail">
      <button className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <div className="book-detail__header">
        <div className={"book-detail__cover" + (media.squareCover ? " book-detail__cover--square" : "")}>
          {book.cover_url ? <img src={book.cover_url} alt="" /> : <div className="book-card__cover-placeholder">{media.icon}</div>}
        </div>
        <div>
          <input
            className="book-detail__title-input"
            value={book.title}
            onChange={(e) => setBook({ ...book, title: e.target.value })}
            onBlur={(e) => save({ title: e.target.value })}
          />
          <input
            className="book-detail__author-input"
            value={book.authors.join(", ")}
            placeholder={`${media.creatorLabel}, comma separated`}
            onChange={(e) => setBook({ ...book, authors: e.target.value.split(",").map((a) => a.trim()) })}
            onBlur={(e) => save({ authors: e.target.value.split(",").map((a) => a.trim()).filter(Boolean) })}
          />
          {book.isbn && (
            <p className="book-detail__isbn">
              {media.codeLabel} {book.isbn}
            </p>
          )}
        </div>
      </div>

      <section className="book-detail__section">
        <label className="section-label">Status</label>
        <div className="status-toggle">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={"status-toggle__btn" + (book.status === s ? " status-toggle__btn--active" : "")}
              onClick={() => save({ status: s })}
            >
              {media.statusLabels[s]}
            </button>
          ))}
        </div>
      </section>

      {media.formats.length > 1 && (
        <section className="book-detail__section">
          <label className="section-label">Format</label>
          <div className="status-toggle">
            {media.formats.map((f) => (
              <button
                key={f.value}
                className={"status-toggle__btn" + (book.format === f.value ? " status-toggle__btn--active" : "")}
                onClick={() => save({ format: f.value })}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {book.media_type !== "book" && (
        <section className="book-detail__section">
          <label className="section-label">Year</label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 1997"
            value={book.year ?? ""}
            onChange={(e) => setBook({ ...book, year: e.target.value ? Number(e.target.value) : null })}
            onBlur={(e) => save({ year: e.target.value ? Number(e.target.value) : null })}
          />
        </section>
      )}

      <section className="book-detail__section">
        <label className="section-label">Rating</label>
        <StarRating value={book.rating} onChange={(v) => save({ rating: v })} />
      </section>

      <section className="book-detail__section">
        <label className="section-label">Genres</label>
        <div className="genre-grid">
          {media.genres.map((g) => {
            const active = book.genres.includes(g);
            return (
              <button
                key={g}
                className={"tag-chip" + (active ? " tag-chip--active" : "")}
                onClick={() => {
                  const genres = active ? book.genres.filter((x) => x !== g) : [...book.genres, g];
                  setBook({ ...book, genres });
                  save({ genres });
                }}
              >
                {g}
              </button>
            );
          })}
        </div>
      </section>

      <section className="book-detail__section">
        <label className="section-label">Tags</label>
        <div className="genre-grid">
          {book.tags.map((t) => (
            <button
              key={t}
              className="tag-chip tag-chip--active"
              onClick={() => {
                const tags = book.tags.filter((x) => x !== t);
                setBook({ ...book, tags });
                save({ tags });
              }}
              title="Click to remove"
            >
              {t} ✕
            </button>
          ))}
        </div>
        <form
          className="tag-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            const value = tagInput.trim();
            if (!value || book.tags.includes(value)) return;
            const tags = [...book.tags, value];
            setBook({ ...book, tags });
            save({ tags });
            setTagInput("");
          }}
        >
          <input placeholder="Add a tag…" value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
          <button type="submit" className="btn btn--ghost btn--sm">
            Add
          </button>
        </form>
      </section>

      {media.seriesLabel && (
        <section className="book-detail__section book-detail__series">
          <label className="section-label">{media.seriesLabel}</label>
          <div className="series-row">
            <input
              placeholder={`${media.seriesLabel} name`}
              value={book.series_name ?? ""}
              onChange={(e) => setBook({ ...book, series_name: e.target.value })}
              onBlur={(e) => save({ seriesName: e.target.value || null })}
            />
            <input
              type="number"
              placeholder="#"
              value={book.series_number ?? ""}
              onChange={(e) => setBook({ ...book, series_number: e.target.value ? Number(e.target.value) : null })}
              onBlur={(e) => save({ seriesNumber: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </section>
      )}

      {!isDigitalFormat(book.format) && (
        <section className="book-detail__section">
          <label className="section-label">Shelf location</label>
          <select
            value={book.shelf_location ?? ""}
            onChange={(e) => {
              const value = e.target.value || null;
              setBook({ ...book, shelf_location: value });
              save({ shelfLocation: value });
            }}
          >
            <option value="">Unset</option>
            {LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </section>
      )}

      <section className="book-detail__section">
        <label className="section-label">Notes</label>
        <textarea
          rows={5}
          placeholder="Your thoughts…"
          value={book.notes ?? ""}
          onChange={(e) => setBook({ ...book, notes: e.target.value })}
          onBlur={(e) => save({ notes: e.target.value })}
        />
      </section>

      {saving && <p className="save-indicator">Saving…</p>}

      <button className="btn btn--danger" onClick={handleDelete}>
        Delete {media.noun}
      </button>
    </div>
  );
}
