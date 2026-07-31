/**
 * Generic confirmation card. Any two step tool sends a confirm view and the card
 * draws it the same way: amount as the anchor, a few detail rows, Approve and
 * Cancel. Approve calls the named tool with only the token; the server verifies
 * it before anything moves.
 */
import { CHECK, SLASH, brand, esc } from "./shared.js";

export type Row = { label: string; value: string };

export type ConfirmView = {
  kind: "confirm";
  eyebrow: string;
  amount?: string;
  rows?: Row[];
  footnote?: string;
  approve: { tool: string; label: string; token: string };
};

export type ResultView = {
  kind: "result";
  status: "ok" | "info" | "error";
  eyebrow?: string;
  amount?: string;
  title?: string;
  body?: string;
};

function rows(list?: Row[]): string {
  if (!list || list.length === 0) return "";
  return `<dl class="details">${list
    .map((r) => `<div class="row"><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`)
    .join("")}</dl>`;
}

function amountBlock(eyebrow: string, amount?: string): string {
  return `<div class="amount-block"><div class="eyebrow">${esc(eyebrow)}</div>${
    amount ? `<div class="amount">$${esc(amount)}</div>` : ""
  }</div>`;
}

export function renderConfirm(
  root: HTMLElement,
  v: ConfirmView,
  handlers: { onApprove: () => void; onCancel: () => void },
): void {
  root.innerHTML = `
    <div class="card">
      ${brand()}
      ${amountBlock(v.eyebrow, v.amount)}
      ${rows(v.rows)}
      <div class="actions">
        <button class="btn primary" id="approve">${esc(v.approve.label)}</button>
        <button class="btn ghost" id="cancel">Cancel</button>
      </div>
      <p class="foot">${esc(v.footnote ?? "Nothing moves until you approve.")}</p>
    </div>`;
  root.querySelector<HTMLButtonElement>("#approve")!.addEventListener("click", handlers.onApprove);
  root.querySelector<HTMLButtonElement>("#cancel")!.addEventListener("click", handlers.onCancel);
}

export function renderPending(root: HTMLElement, v: ConfirmView): void {
  root.innerHTML = `
    <div class="card">
      ${brand()}
      ${amountBlock("Working", v.amount)}
      ${rows(v.rows)}
      <div class="actions">
        <button class="btn primary" disabled><span class="spinner"></span>${esc(v.approve.label)}</button>
        <button class="btn ghost" disabled>Cancel</button>
      </div>
      <p class="foot">Confirming with Cue.</p>
    </div>`;
}

export function renderResult(root: HTMLElement, v: ResultView): void {
  const badge =
    v.status === "ok"
      ? `<div class="badge ok">${CHECK}</div>`
      : `<div class="badge neutral">${SLASH}</div>`;

  const head = v.amount
    ? `<div class="amount-block">${badge}${v.eyebrow ? `<div class="eyebrow">${esc(v.eyebrow)}</div>` : ""}<div class="amount">$${esc(v.amount)}</div></div>`
    : `${badge}${v.title ? `<h2 class="result-title">${esc(v.title)}</h2>` : ""}`;

  root.innerHTML = `
    <div class="card">
      ${brand()}
      ${head}
      ${v.body ? `<p class="result-body">${esc(v.body)}</p>` : ""}
    </div>`;
}

export function renderCancelled(root: HTMLElement, amount?: string): void {
  root.innerHTML = `
    <div class="card">
      ${brand()}
      <div class="badge neutral">${SLASH}</div>
      <h2 class="result-title">Cancelled</h2>
      <p class="result-body">Nothing happened${amount ? `. The $${esc(amount)} is untouched.` : "."}</p>
    </div>`;
}
