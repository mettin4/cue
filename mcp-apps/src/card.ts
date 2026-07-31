/**
 * The one Cue card. Every tool points here and sends a view in its result:
 *   confirm  a preview with Approve and Cancel; Approve calls the tool back with
 *            only the signed token, which the server verifies before acting
 *   panel    a read only display: balance, history, debts, contacts, summaries
 *   result   the outcome of an action, ok or an error
 * Anything without a view falls back to the tool's text, so nothing looks broken.
 */
import { App } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import "./font.generated.css";
import "./card.css";
import { brand } from "./shared.js";
import {
  renderCancelled,
  renderConfirm,
  renderPending,
  renderResult,
  type ConfirmView,
  type ResultView,
} from "./confirm-render.js";
import { renderPanel, type PanelView } from "./panel-render.js";

type View = ConfirmView | PanelView | ResultView;

const root = document.getElementById("root")!;
let current: ConfirmView | null = null;

function textOf(r: CallToolResult): string {
  const p = r.content?.find((c) => c.type === "text");
  return p && "text" in p ? p.text : "Something went wrong. Please try again.";
}

async function approve(): Promise<void> {
  if (!current) return;
  const v = current;
  renderPending(root, v);
  try {
    const res = await app.callServerTool({ name: v.approve.tool, arguments: { confirmationToken: v.approve.token } });
    const sc = res.structuredContent as View | undefined;
    if (res.isError) renderResult(root, { kind: "result", status: "error", body: textOf(res) });
    else if (sc && sc.kind === "result") renderResult(root, sc);
    else if (sc && sc.kind === "panel") renderPanel(root, sc);
    else renderResult(root, { kind: "result", status: "ok", body: textOf(res) });
  } catch {
    renderResult(root, { kind: "result", status: "error", body: "We could not reach Cue. Check your connection and try again." });
  }
}

const app = new App({ name: "Cue", version: "1.0.0" });

app.ontoolresult = (result) => {
  const sc = result.structuredContent as View | undefined;
  if (sc && sc.kind === "confirm") {
    current = sc;
    renderConfirm(root, sc, { onApprove: approve, onCancel: () => renderCancelled(root, current?.amount) });
  } else if (sc && sc.kind === "panel") {
    renderPanel(root, sc);
  } else if (sc && sc.kind === "result") {
    renderResult(root, sc);
  } else {
    renderResult(root, { kind: "result", status: result.isError ? "error" : "info", body: textOf(result) });
  }
};

app.onerror = (e) => console.error(e);

root.innerHTML = `<div class="card">${brand()}</div>`;
app.connect();
