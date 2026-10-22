import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DuplicateInfo, type LookupResult } from "../api";
import { LOCATIONS } from "../constants";
import { MEDIA, physicalFormats, type MediaType } from "../media";
import { MediaTypePicker } from "../components/MediaTypePicker";
import { useMediaType } from "../hooks/useMediaType";

interface QueueItem {
  id: string;
  isbn: string;
  mediaType: MediaType;
  format: string;
  state: "looking-up" | "saved" | "duplicate" | "error";
  result?: LookupResult | null;
  duplicate?: DuplicateInfo | null;
  message?: string;
}

interface NeedsReviewItem {
  id: string;
  isbn: string;
  mediaType: MediaType;
  scannedAt: string;
}

// Desktop-only, keyboard-wedge USB scanner flow. Deliberately utilitarian, not mobile-styled.
export function BulkAddPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [needsReview, setNeedsReview] = useState<NeedsReviewItem[]>([]);
  // Applies to every book saved this session — set it once for the stack you're scanning.
  const [shelfLocation, setShelfLocation] = useState("");
  // Also per batch: scan a stack of all-CDs or all-records, then switch.
  const [mediaType, setMediaType] = useMediaType();
  const [format, setFormat] = useState(physicalFormats(mediaType)[0].value);
  const batchFormats = physicalFormats(mediaType);

  useEffect(() => setFormat(physicalFormats(mediaType)[0].value), [mediaType]);

  useEffect(() => {
    inputRef.current?.focus();
    const refocus = () => inputRef.current?.focus();
    document.addEventListener("click", refocus);
    return () => document.removeEventListener("click", refocus);
  }, []);

  async function processScan(rawIsbn: string) {
    const isbn = rawIsbn.replace(/[^0-9Xx]/g, "").toUpperCase();
    if (!isbn) return;
    const id = crypto.randomUUID();
    // Snapshot the batch settings so switching mid-lookup doesn't change this scan.
    const scanType = mediaType;
    const scanFormat = format;
    setQueue((q) => [{ id, isbn, mediaType: scanType, format: scanFormat, state: "looking-up" }, ...q]);

    try {
      const { found, result, duplicate } = await api.lookupCode(isbn, scanType);
      if (duplicate) {
        setQueue((q) => q.map((item) => (item.id === id ? { ...item, state: "duplicate", result, duplicate } : item)));
        return;
      }
      if (found && result) {
        const res = await api.createBook({
          mediaType: scanType,
          format: scanFormat,
          year: result.year ?? null,
          isbn: result.isbn,
          title: result.title,
          authors: result.authors,
          coverSourceUrl: result.coverSourceUrl,
          source: result.source,
          shelfLocation: shelfLocation || null,
        });
        if (res.duplicate) {
          setQueue((q) =>
            q.map((item) => (item.id === id ? { ...item, state: "duplicate", result, duplicate: res.duplicate } : item))
          );
        } else {
          setQueue((q) => q.map((item) => (item.id === id ? { ...item, state: "saved", result } : item)));
        }
        return;
      }
      // Not found anywhere — drop to needs-review, don't block the scanning burst.
      setQueue((q) => q.filter((item) => item.id !== id));
      setNeedsReview((r) => [{ id, isbn, mediaType: scanType, scannedAt: new Date().toLocaleTimeString() }, ...r]);
    } catch (err) {
      setQueue((q) =>
        q.map((item) =>
          item.id === id ? { ...item, state: "error", message: err instanceof Error ? err.message : "Lookup failed" } : item
        )
      );
    }
  }

  async function addDuplicateAnyway(item: QueueItem) {
    if (!item.result) return;
    const res = await api.createBook({
      mediaType: item.mediaType,
      format: item.format,
      year: item.result.year ?? null,
      isbn: item.result.isbn,
      title: item.result.title,
      authors: item.result.authors,
      coverSourceUrl: item.result.coverSourceUrl,
      source: item.result.source,
      shelfLocation: shelfLocation || null,
      allowDuplicate: true,
    });
    if (res.book) {
      setQueue((q) => q.map((q2) => (q2.id === item.id ? { ...q2, state: "saved" } : q2)));
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = pending.trim();
    setPending("");
    void processScan(value);
  }

  return (
    <div className="bulk-add-page">
      <header className="bulk-add-header">
        <h1>Bulk Add (Desktop)</h1>
        <p>Scan barcodes with the USB scanner — each scan looks up and adds automatically. Click anywhere to keep focus.</p>
        <Link to="/" className="btn btn--ghost btn--sm">
          Back to library
        </Link>
      </header>

      <div className="bulk-scan-form">
        <MediaTypePicker value={mediaType} onChange={setMediaType} />
        {batchFormats.length > 1 && (
          <label className="bulk-shelf-select">
            Format for this batch
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {batchFormats.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="bulk-shelf-select">
          Shelf location for this batch
          <select value={shelfLocation} onChange={(e) => setShelfLocation(e.target.value)}>
            <option value="">Unset</option>
            {LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </label>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            value={pending}
            onChange={(e) => setPending(e.target.value)}
            placeholder="Scan focus — click here if scans stop registering"
            autoFocus
          />
        </form>
      </div>

      <div className="bulk-columns">
        <section>
          <h2>Scanned ({queue.length})</h2>
          <ul className="bulk-queue">
            {queue.map((item) => (
              <li key={item.id} className={`bulk-queue__item bulk-queue__item--${item.state}`}>
                {item.result?.coverSourceUrl && <img src={item.result.coverSourceUrl} alt="" />}
                <div className="bulk-queue__info">
                  <div className="bulk-queue__title">{item.result?.title ?? item.isbn}</div>
                  <div className="bulk-queue__author">{item.result?.authors.join(", ")}</div>
                  {item.state === "looking-up" && <span className="bulk-status">Looking up…</span>}
                  {item.state === "saved" && <span className="bulk-status bulk-status--ok">Added ✓</span>}
                  {item.state === "error" && <span className="bulk-status bulk-status--error">{item.message}</span>}
                  {item.state === "duplicate" && item.duplicate && (
                    <div className="bulk-duplicate-actions">
                      <span className="bulk-status bulk-status--warn">Already have "{item.duplicate.title}"</span>
                      <button className="btn btn--ghost btn--sm" onClick={() => addDuplicateAnyway(item)}>
                        Add anyway
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setQueue((q) => q.filter((x) => x.id !== item.id))}>
                        Skip
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Needs review ({needsReview.length})</h2>
          <ul className="bulk-queue">
            {needsReview.map((item) => (
              <li key={item.id} className="bulk-queue__item bulk-queue__item--error">
                <div className="bulk-queue__info">
                  <div className="bulk-queue__title">
                    {MEDIA[item.mediaType].codeLabel} {item.isbn}
                  </div>
                  <div className="bulk-queue__author">
                    {MEDIA[item.mediaType].tabLabel} · no match found · scanned {item.scannedAt}
                  </div>
                  <Link
                    to={`/add/manual?type=${item.mediaType}&isbn=${encodeURIComponent(item.isbn)}`}
                    className="btn btn--ghost btn--sm"
                  >
                    Resolve manually
                  </Link>
                </div>
              </li>
            ))}
            {needsReview.length === 0 && <p className="bulk-empty">Nothing to review.</p>}
          </ul>
        </section>
      </div>
    </div>
  );
}
