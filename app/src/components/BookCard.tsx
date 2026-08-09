import { Link } from "react-router-dom";
import type { Book } from "../api";
import { StarRating } from "./StarRating";

const STATUS_LABELS: Record<Book["status"], string> = {
  to_read: "To Read",
  reading: "Reading",
  read: "Read",
};

export function BookCard({ book }: { book: Book }) {
  return (
    <Link to={`/books/${book.id}`} className="book-card">
      <div className="book-card__cover">
        {book.cover_url ? (
          <img src={book.cover_url} alt="" loading="lazy" />
        ) : (
          <div className="book-card__cover-placeholder">📖</div>
        )}
      </div>
      <div className="book-card__info">
        <div className="book-card__title">{book.title}</div>
        <div className="book-card__author">{book.authors.join(", ") || "Unknown author"}</div>
        <div className="book-card__meta">
          <span className={`status-pill status-pill--${book.status}`}>{STATUS_LABELS[book.status]}</span>
          {book.rating ? <StarRating value={book.rating} size="sm" /> : null}
        </div>
      </div>
    </Link>
  );
}
