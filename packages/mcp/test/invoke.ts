/**
 * Verifies the six tools without Claude Desktop. It builds the same client and
 * context the server uses and calls each tool handler directly, printing what
 * Claude would see. The two step tools are driven through both calls.
 *
 * Run with the deployed values in the environment:
 *   CUE_API_URL=... CUE_API_KEY=... CUE_USER=... \
 *     npx tsx test/invoke.ts recipient@example.com
 */

import { clientFromEnv } from "../src/config.js";
import { newContext } from "../src/tools.js";
import {
  cancelSend,
  checkClaimStatus,
  getBalance,
  getHistory,
  resendClaimLink,
  sendMoney,
} from "../src/tools.js";

const recipient = process.argv[2];

function show(name: string, r: { text: string; isError?: boolean }) {
  console.log(`\n### ${name}${r.isError ? "  (error)" : ""}`);
  console.log(r.text);
}

function tokenFrom(text: string): string {
  const match = text.match(/confirmationToken "([^"]+)"/);
  if (!match) throw new Error("No confirmation token in preview");
  return match[1];
}

async function main() {
  if (!recipient) {
    console.error("Usage: npx tsx test/invoke.ts recipient@example.com");
    process.exit(1);
  }

  const ctx = newContext(clientFromEnv());

  show("get_balance", await getBalance(ctx));
  show("get_history (limit 5)", await getHistory(ctx, { limit: 5 }));

  const preview = await sendMoney(ctx, { recipientEmail: recipient, amount: 1 });
  show("send_money  step 1, preview", preview);
  const confirm = await sendMoney(ctx, { confirmationToken: tokenFrom(preview.text) });
  show("send_money  step 2, confirmed", confirm);

  // Grab the id of the send just created so the id based tools can be shown.
  const latest = await ctx.client.listActivity({ direction: "out", limit: 1 });
  const id = latest[0]?.transactionId;
  if (!id) throw new Error("Could not read back the send just created");

  show("check_claim_status", await checkClaimStatus(ctx, { transactionId: id }));
  show("resend_claim_link", await resendClaimLink(ctx, { transactionId: id }));

  const cancelPreview = await cancelSend(ctx, { transactionId: id });
  show("cancel_send  step 1, preview", cancelPreview);
  const cancelConfirm = await cancelSend(ctx, {
    confirmationToken: tokenFrom(cancelPreview.text),
  });
  show("cancel_send  step 2, confirmed", cancelConfirm);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
