/**
 * The Cue mark: an open ring in the current text color with a mint caret to its
 * right. The ring inherits color from the surrounding text, so it adapts to
 * whatever surface it sits on.
 */
export function CueMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 124 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M 83.6 36.9 A 36 36 0 1 0 83.6 83.1"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <rect x="103" y="37" width="13" height="46" rx="6.5" fill="#38D389" />
    </svg>
  );
}
