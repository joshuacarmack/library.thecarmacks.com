import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DuplicateInfo, type LookupResult } from "../api";

interface QueueItem {
  id: string;
  isbn: string;
  state: "looking-up" | "saved" | "duplicate" | "error";
  result?: LookupResult | null;
  duplicate?: DuplicateInfo | null;
  message?: string;
}

interface NeedsReviewItem {
  id: string;
  isbn: string;
  scannedAt: string;
}

// Desktop-only, keyboard-wedge USB scanner flow. Deliberately utilitarian, not mobile-styled.
export function BulkAddPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [needsReview, setNeedsReview] = useState<NeedsReviewItem[]>([]);

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
    setQueue((q) => [{ id, isbn, state: "looking-up" }, ...q]);

    try {
      const { found, result, duplicate } = await api.lookupIsbn(isbn);
      if (duplicate) {
        setQueue((q) => q.map((item) => (item.id === id ? { ...item, state: "duplicate", result, duplicate } : item)));
        return;
      }
      if (found && result) {
        const res = await api.createBook({
          isbn: result.isbn,
          title: result.title,
          authors: result.authors,
          coverSourceUrl: result.coverSourceUrl,
          source: result.source,
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
      setNeedsReview((r) => [{ id, isbn, scannedAt: new Date().toLocaleTimeString() }, ...r]);
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
      isbn: item.result.isbn,
      title: item.result.title,
      authors: item.result.authors,
      coverSourceUrl: item.result.coverSourceUrl,
      source: item.result.source,
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

      <form onSubmit={handleSubmit} className="bulk-scan-form">
        <input
          ref={inputRef}
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          placeholder="Scan focus — click here if scans stop registering"
          autoFocus
        />
      </form>

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
                  <div className="bulk-queue__title">ISBN {item.isbn}</div>
                  <div className="bulk-queue__author">No match found · scanned {item.scannedAt}</div>
                  <Link to={`/add/manual?isbn=${encodeURIComponent(item.isbn)}`} className="btn btn--ghost btn--sm">
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
