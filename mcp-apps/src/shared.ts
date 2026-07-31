/** Shared bits for every Cue card: the mark, escaping, the brand row, status. */

export const MARK = `<svg viewBox="0 0 124 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M 83.6 36.9 A 36 36 0 1 0 83.6 83.1" stroke="currentColor" stroke-width="13" stroke-linecap="round"/><rect x="103" y="37" width="13" height="46" rx="6.5" fill="#38D389"/></svg>`;

export const CHECK = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const SLASH = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="m6 6 12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function brand(): string {
  return `<div class="brand">${MARK}<span class="brand-word">Cue</span></div>`;
}

/** Maps a transaction status to a short word and a tone class. */
export const STATUS: Record<string, { text: string; tone: string }> = {
  claimed: { text: "collected", tone: "collected" },
  pending_claim: { text: "waiting", tone: "waiting" },
  cancelled: { text: "called back", tone: "back" },
  failed: { text: "did not go through", tone: "failed" },
  paid: { text: "paid", tone: "collected" },
  pending: { text: "waiting to be paid", tone: "waiting" },
  open: { text: "open", tone: "waiting" },
  settled: { text: "settled", tone: "collected" },
};
