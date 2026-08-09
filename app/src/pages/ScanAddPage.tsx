import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { api, type DuplicateInfo, type LookupResult } from "../api";

type Stage =
  | { name: "scanning" }
  | { name: "looking-up"; isbn: string }
  | { name: "confirm"; isbn: string; result: LookupResult }
  | { name: "duplicate"; isbn: string; result: LookupResult | null; duplicate: DuplicateInfo }
  | { name: "not-found"; isbn: string; validChecksum: boolean }
  | { name: "saving" };

export function ScanAddPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ name: "scanning" });
  const [error, setError] = useState<string | null>(null);

  const handleDetected = useCallback(async (isbn: string) => {
    setStage((prev) => (prev.name === "scanning" ? { name: "looking-up", isbn } : prev));
    try {
      const { found, result, duplicate, validChecksum } = await api.lookupIsbn(isbn);
      if (duplicate) {
        setStage({ name: "duplicate", isbn, result, duplicate });
      } else if (found && result) {
        setStage({ name: "confirm", isbn, result });
      } else {
        setStage({ name: "not-found", isbn, validChecksum });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
      setStage({ name: "scanning" });
    }
  }, []);

  async function saveBook(result: LookupResult, allowDuplicate = false) {
    setStage({ name: "saving" });
    try {
      const res = await api.createBook({
        isbn: result.isbn,
        title: result.title,
        authors: result.authors,
        coverSourceUrl: result.coverSourceUrl,
        source: result.source,
        allowDuplicate,
      });
      if (res.duplicate) {
        setStage({ name: "duplicate", isbn: result.isbn ?? "", result, duplicate: res.duplicate });
        return;
      }
      navigate(`/books/${res.book.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save book.");
      setStage({ name: "confirm", isbn: result.isbn ?? "", result });
    }
  }

  return (
    <div className="scan-page">
      <h1>Scan a book</h1>
      {error && <p className="form-error">{error}</p>}

      {stage.name === "scanning" && (
        <>
          <BarcodeScanner onDetected={handleDetected} />
          <p className="scan-hint">Hold the barcode on the back cover steady in the frame.</p>
          <Link to="/add/manual" className="btn btn--ghost">
            No barcode? Add manually
          </Link>
        </>
      )}

      {stage.name === "looking-up" && <p className="centered-loading">Looking up ISBN {stage.isbn}…</p>}

      {stage.name === "confirm" && (
        <div className="confirm-card">
          {stage.result.coverSourceUrl && <img src={stage.result.coverSourceUrl} alt="" className="confirm-cover" />}
          <h2>{stage.result.title}</h2>
          <p>{stage.result.authors.join(", ") || "Unknown author"}</p>
          <p className="confirm-isbn">ISBN {stage.isbn}</p>
          <div className="confirm-actions">
            <button className="btn btn--primary" onClick={() => saveBook(stage.result)}>
              Add to library
            </button>
            <button className="btn btn--ghost" onClick={() => setStage({ name: "scanning" })}>
              Scan again
            </button>
          </div>
        </div>
      )}

      {stage.name === "duplicate" && (
        <div className="confirm-card">
          <h2>You already have this book</h2>
          <p>"{stage.duplicate.title}" is already in the library.</p>
          <div className="confirm-actions">
            <button className="btn btn--primary" onClick={() => navigate(`/books/${stage.duplicate.id}`)}>
              View existing entry
            </button>
            {stage.result && (
              <button className="btn btn--ghost" onClick={() => saveBook(stage.result!, true)}>
                Add another copy anyway
              </button>
            )}
            <button className="btn btn--ghost" onClick={() => setStage({ name: "scanning" })}>
              Scan again
            </button>
          </div>
        </div>
      )}

      {stage.name === "not-found" && (
        <div className="confirm-card">
          <h2>No match found</h2>
          <p>ISBN {stage.isbn} didn't match Google Books or Open Library.</p>
          {!stage.validChecksum && (
            <p className="form-error">
              That number doesn't check out as a valid ISBN — the barcode may have been misread. Worth a rescan
              before entering it by hand.
            </p>
          )}
          <div className="confirm-actions">
            <Link to={`/add/manual?isbn=${encodeURIComponent(stage.isbn)}`} className="btn btn--primary">
              Enter manually
            </Link>
            <button className="btn btn--ghost" onClick={() => setStage({ name: "scanning" })}>
              Scan again
            </button>
          </div>
        </div>
      )}

      {stage.name === "saving" && <p className="centered-loading">Saving…</p>}
    </div>
  );
}
