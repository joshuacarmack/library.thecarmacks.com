interface StarRatingProps {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: "sm" | "lg";
}

export function StarRating({ value, onChange, size = "lg" }: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];
  const readOnly = !onChange;

  return (
    <div className={`star-rating star-rating--${size}`} role={readOnly ? undefined : "radiogroup"} aria-label="Rating">
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          className={"star-rating__star" + (value && star <= value ? " star-rating__star--filled" : "")}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          onClick={() => onChange?.(value === star ? null : star)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
