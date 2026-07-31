/**
 * Pure rendering for the confirmation card. No host or network here, so the same
 * code draws the card in the live app and in the screenshot harness, and the two
 * can never drift apart.
 */

export type Preview = {
  kind: "send_preview";
  amount: string;
  recipient: string;
  unlockLabel: string;
  /** How much of the spending limit is left after this send, if a limit is set. */
  limitLeft?: string;
  /** "today" or "this month", matching the limit shown. */
  limitScope?: string;
  confirmationToken: string;
};

export type Success = {
  kind: "send_success";
  amount: string;
  recipient: string;
  unlockLabel: string;
};

const MARK = `<svg viewBox="0 0 124 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M 83.6 36.9 A 36 36 0 1 0 83.6 83.1" stroke="currentColor" stroke-width="13" stroke-linecap="round"/><rect x="103" y="37" width="13" height="46" rx="6.5" fill="#38D389"/></svg>`;
const CHECK = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SLASH = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="m6 6 12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function brand(): string {
  return `<div class="brand">${MARK}<span class="brand-word">Cue</span></div>`;
}

function detailRows(p: Preview): string {
  const limit =
    p.limitLeft && p.limitScope
      ? `<div class="row"><dt>Left ${esc(p.limitScope)}</dt><dd class="num">$${esc(p.limitLeft)}</dd></div>`
      : "";
  return `
    <dl class="details">
      <div class="row"><dt>To</dt><dd>${esc(p.recipient)}</dd></div>
      <div class="row"><dt>Collectable</dt><dd>in ${esc(p.unlockLabel)}</dd></div>
      ${limit}
    </dl>`;
}

export function renderSkeleton(root: HTMLElement): void {
  root.innerHTML = `
    <div class="card skeleton">
      ${brand()}
      <div class="amount-block">
        <div class="bar" style="height:11px;width:120px;margin-bottom:14px"></div>
        <div class="bar" style="height:52px;width:190px"></div>
      </div>
      <div class="bar" style="height:1px;width:100%;margin:24px 0"></div>
      <div class="bar" style="height:14px;width:100%;margin-bottom:12px"></div>
      <div class="bar" style="height:14px;width:70%"></div>
    </div>`;
}

export function renderPreview(
  root: HTMLElement,
  p: Preview,
  handlers: { onApprove: () => void; onCancel: () => void },
): void {
  root.innerHTML = `
    <div class="card">
      ${brand()}
      <div class="amount-block">
        <div class="eyebrow">You are sending</div>
        <div class="amount">$${esc(p.amount)}</div>
      </div>
      ${detailRows(p)}
      <div class="actions">
        <button class="btn primary" id="approve">Approve</button>
        <button class="btn ghost" id="cancel">Cancel</button>
      </div>
      <p class="foot">Nothing moves until you approve.</p>
    </div>`;
  root.querySelector<HTMLButtonElement>("#approve")!.addEventListener("click", handlers.onApprove);
  root.querySelector<HTMLButtonElement>("#cancel")!.addEventListener("click", handlers.onCancel);
}

export function renderPending(root: HTMLElement, p: Preview): void {
  root.innerHTML = `
    <div class="card">
      ${brand()}
      <div class="amount-block">
        <div class="eyebrow">Sending</div>
        <div class="amount">$${esc(p.amount)}</div>
      </div>
      ${detailRows(p)}
      <div class="actions">
        <button class="btn primary" disabled><span class="spinner"></span>Sending</button>
        <button class="btn ghost" disabled>Cancel</button>
      </div>
      <p class="foot">Confirming with Cue.</p>
    </div>`;
}

export function renderSuccess(root: HTMLElement, s: Success): void {
  root.innerHTML = `
    <div class="card">
      ${brand()}
      <div class="amount-block">
        <div class="badge ok">${CHECK}</div>
        <div class="eyebrow">Sent</div>
        <div class="amount">$${esc(s.amount)}</div>
      </div>
      <p class="result-body">On its way to ${esc(s.recipient)}. They can collect it in ${esc(
        s.unlockLabel,
      )}, and you can call it back until then.</p>
    </div>`;
}

export function renderError(root: HTMLElement, message: string): void {
  root.innerHTML = `
    <div class="card">
      ${brand()}
      <div class="badge neutral">${SLASH}</div>
      <h2 class="result-title">Not sent</h2>
      <p class="result-body">${esc(message)}</p>
    </div>`;
}

export function renderCancelled(root: HTMLElement, p: Preview | null): void {
  root.innerHTML = `
    <div class="card">
      ${brand()}
      <div class="badge neutral">${SLASH}</div>
      <h2 class="result-title">Cancelled</h2>
      <p class="result-body">Nothing was sent${
        p ? `. The $${esc(p.amount)} is still in your account.` : "."
      }</p>
    </div>`;
}
