import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { MediaTypePicker } from "../components/MediaTypePicker";
import { api, type DuplicateInfo, type LookupResult } from "../api";
import { MEDIA, physicalFormats } from "../media";
import { useMediaType } from "../hooks/useMediaType";

type Stage =
  | { name: "scanning" }
  | { name: "looking-up"; code: string }
  | { name: "confirm"; code: string; result: LookupResult }
  | { name: "duplicate"; code: string; result: LookupResult | null; duplicate: DuplicateInfo }
  | { name: "not-found"; code: string; validChecksum: boolean }
  | { name: "saving" };

export function ScanAddPage() {
  const navigate = useNavigate();
  const [mediaType, setMediaType] = useMediaType();
  const media = MEDIA[mediaType];
  const [stage, setStage] = useState<Stage>({ name: "scanning" });
  const [error, setError] = useState<string | null>(null);
  // CD vs record: MusicBrainz often knows, but she can always correct it before saving.
  const [format, setFormat] = useState(media.formats[0].value);

  useEffect(() => {
    setFormat(MEDIA[mediaType].formats[0].value);
    setStage({ name: "scanning" });
  }, [mediaType]);

  const handleDetected = useCallback(
    async (code: string) => {
      setStage((prev) => (prev.name === "scanning" ? { name: "looking-up", code } : prev));
      try {
        const { found, result, duplicate, validChecksum } = await api.lookupCode(code, mediaType);
        if (duplicate) {
          setStage({ name: "duplicate", code, result, duplicate });
        } else if (found && result) {
          const known = physicalFormats(mediaType).some((f) => f.value === result.format);
          setFormat(known && result.format ? result.format : physicalFormats(mediaType)[0].value);
          setStage({ name: "confirm", code, result });
        } else {
          setStage({ name: "not-found", code, validChecksum });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed.");
        setStage({ name: "scanning" });
      }
    },
    [mediaType]
  );

  async function saveItem(result: LookupResult, allowDuplicate = false) {
    setStage({ name: "saving" });
    try {
      const res = await api.createBook({
        mediaType,
        format,
        year: result.year ?? null,
        isbn: result.isbn,
        title: result.title,
        authors: result.authors,
        coverSourceUrl: result.coverSourceUrl,
        source: result.source,
        allowDuplicate,
      });
      if (res.duplicate) {
        setStage({ name: "duplicate", code: result.isbn ?? "", result, duplicate: res.duplicate });
        return;
      }
      navigate(`/books/${res.book.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not save ${media.noun}.`);
      setStage({ name: "confirm", code: result.isbn ?? "", result });
    }
  }

  const scanFormats = physicalFormats(mediaType);

  return (
    <div className="scan-page">
      <h1>Scan {media.article}</h1>
      {(stage.name === "scanning" || stage.name === "not-found") && (
        <MediaTypePicker value={mediaType} onChange={setMediaType} />
      )}
      {error && <p className="form-error">{error}</p>}

      {stage.name === "scanning" && (
        <>
          <BarcodeScanner onDetected={handleDetected} kind={mediaType === "book" ? "isbn" : "product"} />
          <p className="scan-hint">{media.scanHint}</p>
          <Link to={`/add/manual?type=${mediaType}`} className="btn btn--ghost">
            {mediaType === "movie" ? "No barcode, or on Jellyfin? Add manually" : "No barcode? Add manually"}
          </Link>
          <Link to={`/bulk-add?type=${mediaType}`} className="scan-page__bulk-link">
            Adding a whole stack at a desk? Try Bulk Add with a USB scanner →
          </Link>
        </>
      )}

      {stage.name === "looking-up" && (
        <p className="centered-loading">
          Looking up {media.codeLabel} {stage.code}…
        </p>
      )}

      {stage.name === "confirm" && (
        <div className="confirm-card">
          {stage.result.coverSourceUrl && (
            <img
              src={stage.result.coverSourceUrl}
              alt=""
              className={"confirm-cover" + (media.squareCover ? " confirm-cover--square" : "")}
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
          <h2>{stage.result.title}</h2>
          <p>
            {stage.result.authors.join(", ") || media.unknownCreator}
            {stage.result.year ? ` · ${stage.result.year}` : ""}
          </p>
          <p className="confirm-isbn">
            {media.codeLabel} {stage.code}
          </p>
          {scanFormats.length > 1 && (
            <div className="status-toggle">
              {scanFormats.map((f) => (
                <button
                  key={f.value}
                  className={"status-toggle__btn" + (format === f.value ? " status-toggle__btn--active" : "")}
                  onClick={() => setFormat(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <div className="confirm-actions">
            <button className="btn btn--primary" onClick={() => saveItem(stage.result)}>
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
          <h2>You already have this {media.noun}</h2>
          <p>"{stage.duplicate.title}" is already in the library.</p>
          <div className="confirm-actions">
            <button className="btn btn--primary" onClick={() => navigate(`/books/${stage.duplicate.id}`)}>
              View existing entry
            </button>
            {stage.result && (
              <button className="btn btn--ghost" onClick={() => saveItem(stage.result!, true)}>
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
          <p>
            {media.codeLabel} {stage.code}{" "}
            {mediaType === "book"
              ? "didn't match Google Books or Open Library."
              : mediaType === "music"
                ? "didn't match MusicBrainz or the UPC database."
                : "didn't match the UPC database."}
          </p>
          {mediaType !== "book" && (
            <p className="scan-hint">Wrong type? Switch between Books, Music, and Movies above and scan again.</p>
          )}
          {!stage.validChecksum && (
            <p className="form-error">
              That number doesn't check out as a valid {media.codeLabel === "ISBN" ? "ISBN" : "barcode"} — it may have
              been misread. Worth a rescan before entering it by hand.
            </p>
          )}
          <div className="confirm-actions">
            <Link
              to={`/add/manual?type=${mediaType}&isbn=${encodeURIComponent(stage.code)}`}
              className="btn btn--primary"
            >
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
