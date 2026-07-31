/**
 * Screenshot harness. Renders each card type on a light page, the way a host chat
 * shows them. Not shipped.
 */
import "./font.generated.css";
import "./card.css";
import { renderCancelled, renderConfirm, renderPending, renderResult } from "./confirm-render.js";
import { renderPanel } from "./panel-render.js";

document.body.style.background = "#f7f7f8";
document.body.style.padding = "24px";

const grid = document.getElementById("grid")!;
grid.style.display = "grid";
grid.style.gridTemplateColumns = "repeat(3, 440px)";
grid.style.gap = "26px";
grid.style.alignItems = "start";

function cell(label: string, draw: (el: HTMLElement) => void): void {
  const wrap = document.createElement("div");
  const tag = document.createElement("div");
  tag.textContent = label;
  tag.style.cssText = "font:600 11px/1 ui-sans-serif,system-ui;letter-spacing:.14em;text-transform:uppercase;color:#9a9aa2;padding:0 6px 8px";
  const host = document.createElement("div");
  wrap.append(tag, host);
  grid.append(wrap);
  draw(host);
}

const sendConfirm = {
  kind: "confirm" as const,
  eyebrow: "You are sending",
  amount: "50.00",
  rows: [
    { label: "To", value: "jack@gmail.com" },
    { label: "Collectable", value: "in about an hour" },
    { label: "Left today", value: "$150.00" },
  ],
  approve: { tool: "send_money", label: "Approve", token: "x" },
};

cell("confirm: send", (el) => renderConfirm(el, sendConfirm, { onApprove: () => {}, onCancel: () => {} }));
cell("confirm: split", (el) =>
  renderConfirm(el, {
    kind: "confirm",
    eyebrow: "Splitting",
    amount: "60.00",
    rows: [
      { label: "ana@example.com", value: "$20.01" },
      { label: "bea@example.com", value: "$20.00" },
      { label: "you", value: "$19.99" },
    ],
    approve: { tool: "split_money", label: "Approve", token: "x" },
  }, { onApprove: () => {}, onCancel: () => {} }),
);
cell("pending", (el) => renderPending(el, sendConfirm));
cell("result: sent", (el) => renderResult(el, { kind: "result", status: "ok", eyebrow: "Sent", amount: "50.00", body: "On its way to jack@gmail.com. They can collect it in about an hour." }));
cell("result: saved", (el) => renderResult(el, { kind: "result", status: "ok", title: "Saved Alex", body: "You can now say things like send 5 dollars to Alex." }));
cell("result: error", (el) => renderResult(el, { kind: "result", status: "error", body: "That confirmation is not valid or has expired. Ask me to prepare it again." }));
cell("cancelled", (el) => renderCancelled(el, "50.00"));
cell("panel: balance", (el) =>
  renderPanel(el, {
    kind: "panel",
    eyebrow: "Balance",
    amount: "3.50",
    summary: "Sent $0.00 · Received $3.50 · 2 pending",
    rows: [{ label: "Daily limit $50.00", value: "$45.00 left today", tone: "mint" }],
    list: {
      label: "Recent activity",
      items: [
        { lead: "+$2.00", leadTone: "in", sub: "from a***@example.com", status: "claimed" },
        { lead: "+$1.50", leadTone: "in", sub: "from s***@example.com", status: "pending_claim" },
      ],
    },
  }),
);
cell("panel: debts", (el) =>
  renderPanel(el, {
    kind: "panel",
    eyebrow: "Debts",
    list: {
      items: [
        { lead: "Alex", sub: "owes you $20.00 net", status: "open" },
        { lead: "Sam", sub: "you owe $8.00 net", status: "open" },
      ],
    },
  }),
);
