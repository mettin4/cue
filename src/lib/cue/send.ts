import "server-only";

import { randomBytes } from "crypto";

import { getWalletBalance } from "../circle/wallets";
import {
  DEFAULT_CANCEL_WINDOW_SECONDS,
  allowShortCancelWindow,
  appUrl,
  brandMarkUrl,
  maxSendUsdc,
  treasuryWalletId,
} from "../config";
import { claimInviteEmail } from "../email/templates";
import { sendAndLog } from "../email/send";
import { getSupabaseAdmin } from "../supabase/server";
import { addAmounts, maskEmail, normaliseEmail, parseAmount, toAmountString } from "./money";
import type { EmailResult } from "../email/send";
import type { TransactionRow, UserRow } from "./types";

/**
 * Generates a URL safe claim token. 32 random bytes encoded as base64url gives
 * 43 characters and 256 bits of entropy, so tokens are not guessable.
 */
function generateClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

export type CreateSendResult = {
  transactionId: string;
  claimToken: string;
  claimUrl: string;
  amount: string;
  cancelDeadline: Date;
  email: EmailResult;
};

/**
 * Creates a pending send and emails the recipient a claim link.
 *
 * No funds move on chain here. The money is only transferred when the recipient
 * claims, which makes cancelling free: it is a single status update with
 * nothing to unwind on chain.
 */
export async function createSend(params: {
  senderUserId: string;
  recipientEmail: string;
  amountUsdc: string | number;
  /** Seconds the sender keeps to call the money back. Claims unlock after it. */
  cancelWindowSeconds?: number;
}): Promise<CreateSendResult> {
  const supabase = getSupabaseAdmin();

  const amount = parseAmount(params.amountUsdc);
  const recipientEmail = normaliseEmail(params.recipientEmail);

  if (!recipientEmail.includes("@")) {
    throw new Error(
      `"${params.recipientEmail}" does not look like a valid email address. Check the address and try again.`,
    );
  }

  // Cap the amount while on testnet. Enforced here so the API and the future
  // MCP server are both bound by it.
  const cap = maxSendUsdc();
  if (Number(amount) > cap) {
    throw new Error(
      `That is more than the current limit of ${cap.toFixed(2)} dollars per send. Try a smaller amount.`,
    );
  }

  // Floor the cancel window to the default. A shorter window would shrink the
  // sender's safety period, so client values below the default are ignored
  // unless a local flag explicitly allows them for testing.
  const requested = params.cancelWindowSeconds ?? DEFAULT_CANCEL_WINDOW_SECONDS;
  const cancelWindowSeconds =
    allowShortCancelWindow() || requested >= DEFAULT_CANCEL_WINDOW_SECONDS
      ? requested
      : DEFAULT_CANCEL_WINDOW_SECONDS;

  // Resolve the sender so the email can name them and the row can reference them.
  const { data: sender, error: senderError } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", params.senderUserId)
    .maybeSingle<Pick<UserRow, "id" | "email">>();

  if (senderError) {
    throw new Error(`Could not look up the sender: ${senderError.message}`);
  }
  if (!sender) {
    throw new Error(`No user found with id ${params.senderUserId}.`);
  }

  if (normaliseEmail(sender.email) === recipientEmail) {
    throw new Error(
      "Money can only be sent to someone else. Please use a different email address, not your own.",
    );
  }

  await assertTreasuryCanCover(amount);

  const claimToken = generateClaimToken();
  const cancelDeadline = new Date(Date.now() + cancelWindowSeconds * 1000);

  const { data: inserted, error: insertError } = await supabase
    .from("transactions")
    .insert({
      sender_id: sender.id,
      recipient_email: recipientEmail,
      amount_usdc: amount,
      status: "pending_claim",
      claim_token: claimToken,
      cancel_deadline: cancelDeadline.toISOString(),
    })
    .select("id")
    .single<Pick<TransactionRow, "id">>();

  if (insertError || !inserted) {
    throw new Error(
      `Could not record the send: ${insertError?.message ?? "no row returned"}`,
    );
  }

  const claimUrl = `${appUrl()}/claim/${claimToken}`;

  const { subject, html } = claimInviteEmail({
    amount,
    senderLabel: maskEmail(sender.email),
    claimUrl,
    unlocksAt: cancelDeadline,
    markUrl: brandMarkUrl(),
  });

  const email = await sendAndLog({
    to: recipientEmail,
    subject,
    html,
    type: "claim_invite",
    transactionId: inserted.id,
  });

  return {
    transactionId: inserted.id,
    claimToken,
    claimUrl,
    amount,
    cancelDeadline,
    email,
  };
}

/**
 * Confirms the treasury can cover this send on top of everything already
 * promised.
 *
 * Because funds stay put until a claim, every pending_claim row is an unfunded
 * promise against the same treasury balance. Checking the new amount alone
 * would let many sends pass validation and then fail at claim time, so the
 * already committed total is included.
 */
async function assertTreasuryCanCover(amount: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: pending, error } = await supabase
    .from("transactions")
    .select("amount_usdc")
    .eq("status", "pending_claim");

  if (error) {
    throw new Error(`Could not read pending sends: ${error.message}`);
  }

  const committed = (pending ?? []).reduce(
    (total, row) => addAmounts(total, toAmountString(row.amount_usdc)),
    "0.00",
  );

  const required = addAmounts(committed, amount);
  const { amount: balance } = await getWalletBalance(treasuryWalletId());

  if (Number(balance) < Number(required)) {
    throw new Error(
      `There is not enough available to send ${amount} dollars right now. Add money or try a smaller amount.`,
    );
  }
}
