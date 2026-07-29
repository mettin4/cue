import "server-only";

import { brandMarkUrl } from "../config";
import { sendCancelledEmail } from "../email/templates";
import { sendAndLog } from "../email/send";
import { getSupabaseAdmin } from "../supabase/server";
import { maskEmail, toAmountString } from "./money";
import type { EmailResult } from "../email/send";
import type { TransactionRow, UserRow } from "./types";

export type CancelSendResult = {
  transactionId: string;
  amount: string;
  recipientEmail: string;
  email: EmailResult | null;
};

/**
 * Calls back a send that has not been collected yet.
 *
 * Only the sender can cancel, and only while the row is still pending. The
 * update is a single conditional statement so that a cancel racing a claim
 * cannot both win: whichever statement moves the row out of pending_claim
 * first is the one that takes effect.
 */
export async function cancelSend(params: {
  transactionId: string;
  senderUserId: string;
}): Promise<CancelSendResult> {
  const supabase = getSupabaseAdmin();

  const { data: cancelled, error: cancelError } = await supabase
    .from("transactions")
    .update({ status: "cancelled" })
    .eq("id", params.transactionId)
    .eq("sender_id", params.senderUserId)
    .eq("status", "pending_claim")
    .select("id, recipient_email, amount_usdc, sender_id")
    .maybeSingle<
      Pick<
        TransactionRow,
        "id" | "recipient_email" | "amount_usdc" | "sender_id"
      >
    >();

  if (cancelError) {
    throw new Error(`Could not cancel the send: ${cancelError.message}`);
  }

  if (!cancelled) {
    // Nothing was updated. Work out which rule blocked it so the caller can
    // show something better than a generic failure.
    throw await explainCancelFailure(params);
  }

  const amount = toAmountString(cancelled.amount_usdc);

  // Only warn the recipient if they were actually told about the money.
  const { data: invites } = await supabase
    .from("email_logs")
    .select("id")
    .eq("transaction_id", cancelled.id)
    .eq("type", "claim_invite")
    .limit(1);

  let email: EmailResult | null = null;

  if (invites && invites.length > 0) {
    const { data: sender } = await supabase
      .from("users")
      .select("email")
      .eq("id", params.senderUserId)
      .maybeSingle<Pick<UserRow, "email">>();

    const { subject, html } = sendCancelledEmail({
      amount,
      senderLabel: sender?.email ? maskEmail(sender.email) : "The sender",
      markUrl: brandMarkUrl(),
    });

    email = await sendAndLog({
      to: cancelled.recipient_email,
      subject,
      html,
      type: "send_cancelled",
      transactionId: cancelled.id,
    });
  }

  return {
    transactionId: cancelled.id,
    amount,
    recipientEmail: cancelled.recipient_email,
    email,
  };
}

async function explainCancelFailure(params: {
  transactionId: string;
  senderUserId: string;
}): Promise<Error> {
  const supabase = getSupabaseAdmin();

  const { data: row } = await supabase
    .from("transactions")
    .select("id, sender_id, status")
    .eq("id", params.transactionId)
    .maybeSingle<Pick<TransactionRow, "id" | "sender_id" | "status">>();

  if (!row) {
    return new Error(`No send found with id ${params.transactionId}.`);
  }

  if (row.sender_id !== params.senderUserId) {
    return new Error("Only the sender can call back a send.");
  }

  if (row.status === "claimed") {
    return new Error(
      "This money was already collected, so it can no longer be called back.",
    );
  }

  if (row.status === "cancelled") {
    return new Error("This send was already called back.");
  }

  return new Error("This send is no longer active, so it cannot be called back.");
}
