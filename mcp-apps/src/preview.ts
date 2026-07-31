/**
 * Screenshot harness. Renders the cards on a light page, the way a host chat
 * shows them, so the framing reads true. Not shipped.
 */
import "./font.generated.css";
import "./confirm-send.css";
import "./balance.css";
import { renderPreview, renderSuccess, type Preview } from "./render.js";
import { renderBalance, type Balance } from "./balance-render.js";

document.body.style.background = "#f7f7f8";
document.body.style.padding = "24px";

const sample: Preview = {
  kind: "send_preview",
  amount: "50.00",
  recipient: "jack@gmail.com",
  unlockLabel: "about an hour",
  limitLeft: "150.00",
  limitScope: "today",
  confirmationToken: "sample",
};

const balance: Balance = {
  kind: "balance",
  balance: "3.50",
  totalSent: "0.00",
  totalReceived: "3.50",
  pendingCount: 2,
  daily: undefined,
  monthly: undefined,
  activity: [
    { amount: "2.00", direction: "in", counterparty: "a***@example.com", status: "claimed" },
    { amount: "1.50", direction: "in", counterparty: "s***@example.com", status: "pending_claim" },
  ],
};

const grid = document.getElementById("grid")!;
grid.style.display = "grid";
grid.style.gridTemplateColumns = "repeat(2, 460px)";
grid.style.gap = "28px";
grid.style.alignItems = "start";

function cell(draw: (el: HTMLElement) => void): void {
  const host = document.createElement("div");
  grid.append(host);
  draw(host);
}

cell((el) => renderPreview(el, sample, { onApprove: () => {}, onCancel: () => {} }));
cell((el) =>
  renderSuccess(el, { kind: "send_success", amount: sample.amount, recipient: sample.recipient, unlockLabel: sample.unlockLabel }),
);
cell((el) => renderBalance(el, balance));
