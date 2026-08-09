import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type PublicWishlistItem } from "../api";

type State =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; name: string; items: PublicWishlistItem[] };

// No auth, no AppShell/bottom nav — this is the page a link gets shared to
// (text message, email), viewed by someone with no account on the app at all.
export function PublicWishlistPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!token) return;
    setState({ status: "loading" });
    api
      .getPublicWishlist(token)
      .then((res) => setState({ status: "ready", name: res.name, items: res.items }))
      .catch(() => setState({ status: "not-found" }));
  }, [token]);

  return (
    <div className="public-wishlist-page">
      {state.status === "loading" && <p className="centered-loading">Loading…</p>}

      {state.status === "not-found" && (
        <div className="empty-state">
          <p>This wishlist link isn't valid — it may have been made private or doesn't exist.</p>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <header className="public-wishlist-header">
            <h1>📚 {state.name}</h1>
            <p className="library-header__subtitle">
              {state.items.length} book{state.items.length === 1 ? "" : "s"} · The Carmacks' Library
            </p>
          </header>

          {state.items.length === 0 ? (
            <div className="empty-state">
              <p>Nothing on this list yet.</p>
            </div>
          ) : (
            <div className="book-grid">
              {state.items.map((item) => (
                <div key={item.id} className="book-card">
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
                    {item.isbn && <div className="wishlist-card__isbn">ISBN {item.isbn}</div>}
                    {item.notes && <div className="wishlist-card__notes">{item.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
