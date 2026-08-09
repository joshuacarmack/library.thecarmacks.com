import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type DuplicateInfo, type LookupResult, type Wishlist, type WishlistItem } from "../api";

type AddMode = "closed" | "search" | "results" | "form";

export function WishlistPage() {
  const [params, setParams] = useSearchParams();
  const [lists, setLists] = useState<Wishlist[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [newListName, setNewListName] = useState<string | null>(null); // non-null while the "new list" input is open
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addMode, setAddMode] = useState<AddMode>("closed");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LookupResult[]>([]);
  const [alreadyOwned, setAlreadyOwned] = useState<DuplicateInfo | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [form, setForm] = useState({ isbn: "", title: "", authors: "", coverSourceUrl: "", notes: "" });

  const activeListId = params.get("list");
  const activeList = lists.find((l) => l.id === activeListId) ?? null;

  function refreshLists() {
    setListsLoading(true);
    return api
      .listWishlists()
      .then((res) => {
        setLists(res.wishlists);
        // If nothing (valid) is selected yet, default to the first list.
        if (!res.wishlists.some((l) => l.id === activeListId)) {
          if (res.wishlists[0]) setParams({ list: res.wishlists[0].id }, { replace: true });
          else setParams({}, { replace: true });
        }
      })
      .finally(() => setListsLoading(false));
  }

  function refreshItems(listId: string) {
    setItemsLoading(true);
    return api
      .listWishlist(listId)
      .then((res) => setItems(res.items))
      .finally(() => setItemsLoading(false));
  }

  useEffect(() => {
    refreshLists();
  }, []);

  useEffect(() => {
    if (activeListId) refreshItems(activeListId);
    else setItems([]);
  }, [activeListId]);

  function resetAddFlow() {
    setAddMode("closed");
    setQuery("");
    setResults([]);
    setAlreadyOwned(null);
    setDuplicate(null);
    setForm({ isbn: "", title: "", authors: "", coverSourceUrl: "", notes: "" });
  }

  async function handleCreateList(e: FormEvent) {
    e.preventDefault();
    const name = newListName?.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await api.createWishlist(name);
      setNewListName(null);
      await refreshLists();
      setParams({ list: res.wishlist.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create list.");
    }
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!activeList || !renameValue.trim()) return;
    setError(null);
    try {
      await api.renameWishlist(activeList.id, renameValue.trim());
      setRenaming(false);
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename list.");
    }
  }

  async function handleDeleteList() {
    if (!activeList) return;
    if (!confirm(`Delete "${activeList.name}" and everything on it? This can't be undone.`)) return;
    await api.deleteWishlist(activeList.id);
    setParams({}, { replace: true });
    await refreshLists();
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
    if (!form.title.trim() || !activeListId) return;
    setError(null);
    try {
      const res = await api.addToWishlist({
        wishlistId: activeListId,
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
      await Promise.all([refreshItems(activeListId), refreshLists()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to wishlist.");
    }
  }

  async function handleConvert(item: WishlistItem) {
    if (!activeListId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await api.convertWishlistItem(item.id);
      if (res.alreadyOwned) {
        setError(`"${item.title}" turned out to already be in the library.`);
      }
      await Promise.all([refreshItems(activeListId), refreshLists()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move this to the library.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(item: WishlistItem) {
    if (!activeListId) return;
    if (!confirm(`Remove "${item.title}" from the wishlist?`)) return;
    setBusyId(item.id);
    try {
      await api.removeFromWishlist(item.id);
      await Promise.all([refreshItems(activeListId), refreshLists()]);
    } finally {
      setBusyId(null);
    }
  }

  async function handleMove(item: WishlistItem, targetListId: string) {
    if (!activeListId || targetListId === item.wishlist_id) return;
    setBusyId(item.id);
    try {
      await api.updateWishlistItem(item.id, { wishlistId: targetListId });
      await Promise.all([refreshItems(activeListId), refreshLists()]);
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
            {activeList ? `${activeList.item_count} book${activeList.item_count === 1 ? "" : "s"}` : "No list selected"}
          </p>
        </div>
        {activeList && (
          <button className="btn btn--primary btn--sm" onClick={() => setAddMode("search")}>
            + Add
          </button>
        )}
      </header>

      {error && <p className="form-error">{error}</p>}

      {!listsLoading && (
        <div className="library-tags wishlist-tabs">
          {lists.map((l) => (
            <button
              key={l.id}
              className={"tag-chip" + (l.id === activeListId ? " tag-chip--active" : "")}
              onClick={() => setParams({ list: l.id })}
            >
              {l.name} ({l.item_count})
            </button>
          ))}
          {newListName === null ? (
            <button className="tag-chip" onClick={() => setNewListName("")}>
              + New list
            </button>
          ) : (
            <form className="tag-input-row wishlist-tabs__new-form" onSubmit={handleCreateList}>
              <input
                autoFocus
                placeholder="List name…"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onBlur={() => !newListName && setNewListName(null)}
              />
              <button type="submit" className="btn btn--ghost btn--sm">
                Add
              </button>
            </form>
          )}
        </div>
      )}

      {activeList && (
        <div className="wishlist-manage">
          {!renaming ? (
            <>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setRenameValue(activeList.name);
                  setRenaming(true);
                }}
              >
                Rename list
              </button>
              <button className="btn btn--ghost btn--sm" onClick={handleDeleteList}>
                Delete list
              </button>
            </>
          ) : (
            <form className="tag-input-row" onSubmit={handleRename}>
              <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
              <button type="submit" className="btn btn--ghost btn--sm">
                Save
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </form>
          )}
        </div>
      )}

      {addMode !== "closed" && activeListId && (
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
              <h2>Already on this list</h2>
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

      {listsLoading ? (
        <p className="centered-loading">Loading…</p>
      ) : lists.length === 0 ? (
        <div className="empty-state">
          <p>No wishlists yet.</p>
          <button className="btn btn--primary" onClick={() => setNewListName("")}>
            Create your first list
          </button>
        </div>
      ) : itemsLoading ? (
        <p className="centered-loading">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>Nothing on "{activeList?.name}" yet.</p>
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
                  {lists.length > 1 && (
                    <select
                      className="wishlist-card__move"
                      value={item.wishlist_id}
                      disabled={busyId === item.id}
                      onChange={(e) => handleMove(item, e.target.value)}
                      aria-label="Move to another list"
                    >
                      {lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.id === item.wishlist_id ? l.name : `Move to ${l.name}`}
                        </option>
                      ))}
                    </select>
                  )}
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
