/**
 * Renders the get_balance panel. Read only: it just draws what the tool result
 * carries. Shares the card look with the confirmation card.
 */

export type Limit = { limit: string; remaining: string };
export type Activity = {
  amount: string;
  direction: "in" | "out";
  counterparty: string;
  status: "pending_claim" | "claimed" | "cancelled" | "failed";
};
export type Balance = {
  kind: "balance";
  balance: string;
  totalSent: string;
  totalReceived: string;
  pendingCount: number;
  daily?: Limit;
  monthly?: Limit;
  activity: Activity[];
};

const MARK = `<svg viewBox="0 0 124 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M 83.6 36.9 A 36 36 0 1 0 83.6 83.1" stroke="currentColor" stroke-width="13" stroke-linecap="round"/><rect x="103" y="37" width="13" height="46" rx="6.5" fill="#38D389"/></svg>`;

function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const STATUS: Record<Activity["status"], { text: string; tone: string }> = {
  claimed: { text: "collected", tone: "collected" },
  pending_claim: { text: "waiting", tone: "waiting" },
  cancelled: { text: "called back", tone: "back" },
  failed: { text: "did not go through", tone: "failed" },
};

function activityRow(a: Activity): string {
  const s = STATUS[a.status];
  const sign = a.direction === "in" ? "+" : "-";
  const dir = a.direction === "in" ? "from" : "to";
  return `
    <div class="act-row">
      <span class="act-amount ${a.direction}">${sign}$${esc(a.amount)}</span>
      <span class="act-meta">
        <span class="status ${s.tone}">${s.text}</span> · ${dir} ${esc(a.counterparty)}
      </span>
    </div>`;
}

export function renderBalance(root: HTMLElement, d: Balance): void {
  const limits =
    d.daily || d.monthly
      ? `<div class="limits">${[
          d.daily ? `<span>Daily limit $${esc(d.daily.limit)} <span class="sep">·</span> <span class="num">$${esc(d.daily.remaining)}</span> left today</span>` : "",
          d.monthly ? `<span>Monthly limit $${esc(d.monthly.limit)} <span class="sep">·</span> <span class="num">$${esc(d.monthly.remaining)}</span> left this month</span>` : "",
        ].join("")}</div>`
      : `<div class="limits"><span>No spending limits set.</span></div>`;

  const activity =
    d.activity.length > 0
      ? `<div class="section-label">Recent activity</div><div class="act">${d.activity.map(activityRow).join("")}</div>`
      : `<div class="section-label">Recent activity</div><p class="empty">Nothing yet.</p>`;

  root.innerHTML = `
    <div class="card">
      <div class="brand">${MARK}<span class="brand-word">Cue</span></div>
      <div class="amount-block">
        <div class="eyebrow">Balance</div>
        <div class="amount">$${esc(d.balance)}</div>
      </div>
      <p class="summary">
        Sent <span class="num">$${esc(d.totalSent)}</span>
        <span class="sep">·</span>
        Received <span class="num">$${esc(d.totalReceived)}</span>
        <span class="sep">·</span>
        <span class="num">${d.pendingCount}</span> pending
      </p>
      ${limits}
      ${activity}
    </div>`;
}
