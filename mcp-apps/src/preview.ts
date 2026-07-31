/**
 * Screenshot harness. Draws every card state side by side with sample data so
 * the design can be reviewed without a live host. Not shipped.
 */
import "./font.generated.css";
import "./confirm-send.css";
import {
  renderCancelled,
  renderError,
  renderPending,
  renderPreview,
  renderSuccess,
  type Preview,
} from "./render.js";

const sample: Preview = {
  kind: "send_preview",
  amount: "50.00",
  recipient: "jack@gmail.com",
  unlockLabel: "about an hour",
  balanceAfter: "142.00",
  confirmationToken: "sample",
};

const grid = document.getElementById("grid")!;
grid.style.display = "grid";
grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(300px, 1fr))";
grid.style.gap = "8px";
grid.style.maxWidth = "1000px";
grid.style.margin = "0 auto";

function cell(label: string, draw: (el: HTMLElement) => void): void {
  const wrap = document.createElement("div");
  const tag = document.createElement("div");
  tag.textContent = label;
  tag.style.cssText =
    "font:500 11px/1 ui-sans-serif,system-ui;letter-spacing:0.14em;text-transform:uppercase;color:#5f5f68;padding:10px 8px 4px";
  const host = document.createElement("div");
  wrap.append(tag, host);
  grid.append(wrap);
  draw(host);
}

cell("preview", (el) => renderPreview(el, sample, { onApprove: () => {}, onCancel: () => {} }));
cell("pending", (el) => renderPending(el, sample));
cell("success", (el) =>
  renderSuccess(el, {
    kind: "send_success",
    amount: sample.amount,
    recipient: sample.recipient,
    unlockLabel: sample.unlockLabel,
  }),
);
cell("expired or used token", (el) =>
  renderError(
    el,
    "That confirmation is not valid or has expired. Ask me to prepare the payment again.",
  ),
);
cell("failure with reason", (el) =>
  renderError(
    el,
    "There is not enough available to send 50.00 dollars right now. Add money or try a smaller amount.",
  ),
);
cell("cancelled", (el) => renderCancelled(el, sample));
