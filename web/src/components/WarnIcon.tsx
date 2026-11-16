// A small warning triangle drawn in the text colour (never a warm colour:
// those mean stress on this page). Always used next to words that say what
// is wrong, so screen readers skip it.

export function WarnIcon() {
  return (
    <svg className="warn-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5 15 14.5H1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 6v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="12.2" r="0.9" fill="currentColor" />
    </svg>
  );
}
