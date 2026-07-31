/**
 * Generic display panel. Any read only or result tool sends a panel view and the
 * card draws it: an optional amount anchor, a summary line, detail rows, and a
 * list with status colours. Same card language as the confirmation card.
 */
import { STATUS, brand, esc } from "./shared.js";

export type PanelRow = { label: string; value: string; tone?: "mint" | "plain" | "muted" };
export type PanelItem = {
  lead: string;
  leadTone?: "in" | "out" | "mint" | "plain";
  sub?: string;
  status?: string; // a transaction/debt/request status key, mapped to a colour
};
export type PanelView = {
  kind: "panel";
  eyebrow: string;
  amount?: string;
  summary?: string;
  rows?: PanelRow[];
  list?: { label?: string; items: PanelItem[] };
  note?: string;
};

function toneClass(t?: string): string {
  return t === "mint" ? "num" : t === "muted" ? "muted" : "";
}

function itemRow(i: PanelItem): string {
  const s = i.status ? STATUS[i.status] : undefined;
  const status = s ? `<span class="status ${s.tone}">${s.text}</span>` : "";
  const sub = i.sub ? `${status ? `${status} · ` : ""}${esc(i.sub)}` : status;
  const leadCls = i.leadTone === "in" || i.leadTone === "out" ? `act-amount ${i.leadTone}` : "act-lead";
  return `
    <div class="act-row">
      <span class="${leadCls}">${esc(i.lead)}</span>
      <span class="act-meta">${sub}</span>
    </div>`;
}

export function renderPanel(root: HTMLElement, v: PanelView): void {
  const amount = v.amount ? `<div class="amount-block"><div class="eyebrow">${esc(v.eyebrow)}</div><div class="amount">$${esc(v.amount)}</div></div>` : `<div class="eyebrow" style="margin-top:18px">${esc(v.eyebrow)}</div>`;

  const summary = v.summary ? `<p class="summary">${esc(v.summary)}</p>` : "";

  const rows = v.rows && v.rows.length
    ? `<div class="limits">${v.rows
        .map((r) => `<span>${esc(r.label)} <span class="sep">·</span> <span class="${toneClass(r.tone)}">${esc(r.value)}</span></span>`)
        .join("")}</div>`
    : "";

  const list = v.list
    ? `${v.list.label ? `<div class="section-label">${esc(v.list.label)}</div>` : ""}` +
      (v.list.items.length
        ? `<div class="act">${v.list.items.map(itemRow).join("")}</div>`
        : `<p class="empty">Nothing yet.</p>`)
    : "";

  root.innerHTML = `
    <div class="card">
      ${brand()}
      ${amount}
      ${summary}
      ${rows}
      ${list}
      ${v.note ? `<p class="result-body" style="margin-top:16px">${esc(v.note)}</p>` : ""}
    </div>`;
}
