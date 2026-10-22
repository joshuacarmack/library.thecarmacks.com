import { Link } from "react-router-dom";
import type { Book } from "../api";
import { StarRating } from "./StarRating";
import { MEDIA, formatLabel } from "../media";

export function BookCard({ book }: { book: Book }) {
  const media = MEDIA[book.media_type] ?? MEDIA.book;
  return (
    <Link to={`/books/${book.id}`} className="book-card">
      <div className={"book-card__cover" + (media.squareCover ? " book-card__cover--square" : "")}>
        {book.cover_url ? (
          <img src={book.cover_url} alt="" loading="lazy" />
        ) : (
          <div className="book-card__cover-placeholder">{media.icon}</div>
        )}
      </div>
      <div className="book-card__info">
        <div className="book-card__title">{book.title}</div>
        <div className="book-card__author">
          {book.authors.join(", ") || media.unknownCreator}
          {book.year ? ` · ${book.year}` : ""}
        </div>
        <div className="book-card__meta">
          <span className={`status-pill status-pill--${book.status}`}>{media.statusLabels[book.status]}</span>
          {book.media_type !== "book" && (
            <span className="status-pill status-pill--format">{formatLabel(book.media_type, book.format)}</span>
          )}
          {book.rating ? <StarRating value={book.rating} size="sm" /> : null}
        </div>
      </div>
    </Link>
  );
}
