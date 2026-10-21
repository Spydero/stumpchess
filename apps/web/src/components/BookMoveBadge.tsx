"use client";

/** Chess.com / Lichess-style book marker for opening moves. */
export function BookMoveBadge({
  compact,
  large,
  title = "Book move",
}: {
  compact?: boolean;
  /** Bigger pill with full "Book move" label */
  large?: boolean;
  title?: string;
}) {
  if (compact) {
    return (
      <span className="book-move-badge book-move-badge--compact" title={title} aria-label={title}>
        <BookIcon />
      </span>
    );
  }
  return (
    <span
      className={`book-move-badge ${large ? "book-move-badge--large" : ""}`}
      title={title}
    >
      <BookIcon />
      <span>{large ? "Book move" : "Book"}</span>
    </span>
  );
}

function BookIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M2.5 1.5A1.5 1.5 0 0 1 4 0h9.5A.5.5 0 0 1 14 .5v13a.5.5 0 0 1-.5.5H4a1 1 0 0 0-1 1h10.5a.5.5 0 0 1 0 1H2.5A1.5 1.5 0 0 1 1 14V2.5A1.5 1.5 0 0 1 2.5 1.5ZM4 1a.5.5 0 0 0-.5.5v11.086A1.99 1.99 0 0 1 4 12h9V1H4Z" />
    </svg>
  );
}
