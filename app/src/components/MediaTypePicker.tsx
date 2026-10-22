import { MEDIA, MEDIA_TYPES, type MediaType } from "../media";

/** Books / Music / Movies switch, shown at the top of the library and the add pages. */
export function MediaTypePicker({ value, onChange }: { value: MediaType; onChange: (type: MediaType) => void }) {
  return (
    <div className="status-toggle media-picker" role="tablist" aria-label="Media type">
      {MEDIA_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="tab"
          aria-selected={value === type}
          className={"status-toggle__btn" + (value === type ? " status-toggle__btn--active" : "")}
          onClick={() => onChange(type)}
        >
          <span aria-hidden="true">{MEDIA[type].icon}</span> {MEDIA[type].tabLabel}
        </button>
      ))}
    </div>
  );
}
