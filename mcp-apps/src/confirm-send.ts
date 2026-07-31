/**
 * Cue send confirmation card.
 *
 * The host renders this when send_money returns its preview. The preview data
 * (amount, recipient, unlock time, balance after, and the signed confirmation
 * token) arrives through ontoolresult. Approve calls send_money again with only
 * the token; the server decodes the amount, recipient and account from the token
 * and verifies it before anything moves. The button triggers the call, it does
 * not authorize it.
 */
import { App } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import "./font.generated.css";
import "./confirm-send.css";
import {
  renderCancelled,
  renderError,
  renderPending,
  renderPreview,
  renderSkeleton,
  renderSuccess,
  type Preview,
  type Success,
} from "./render.js";

const root = document.getElementById("root")!;
let current: Preview | null = null;

function textOf(result: CallToolResult): string {
  const part = result.content?.find((c) => c.type === "text");
  return part && "text" in part ? part.text : "Something went wrong. Please try again.";
}

async function approve(): Promise<void> {
  if (!current) return;
  const preview = current;
  renderPending(root, preview);
  try {
    // Only the token crosses back. The server is the authority on amount,
    // recipient and account, and verifies the token before it moves anything.
    const result = await app.callServerTool({
      name: "send_money",
      arguments: { confirmationToken: preview.confirmationToken },
    });
    const data = result.structuredContent as Success | undefined;
    if (result.isError) {
      renderError(root, textOf(result));
    } else if (data && data.kind === "send_success") {
      renderSuccess(root, data);
    } else {
      renderSuccess(root, {
        kind: "send_success",
        amount: preview.amount,
        recipient: preview.recipient,
        unlockLabel: preview.unlockLabel,
      });
    }
  } catch {
    renderError(root, "We could not reach Cue. Check your connection and try again.");
  }
}

function show(p: Preview): void {
  current = p;
  renderPreview(root, p, { onApprove: approve, onCancel: () => renderCancelled(root, current) });
}

const app = new App({ name: "Cue send confirmation", version: "1.0.0" });

app.ontoolresult = (result) => {
  const data = result.structuredContent as Preview | undefined;
  if (data && data.kind === "send_preview") show(data);
};

app.onerror = (error) => console.error(error);

renderSkeleton(root);
app.connect();
