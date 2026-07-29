import "server-only";

import { appUrl, brandMarkUrl } from "../config";
import { sendAndLog } from "../email/send";
import { claimInviteEmail } from "../email/templates";
import { getSupabaseAdmin } from "../supabase/server";
import { maskEmail, normaliseEmail, toAmountString } from "./money";
import type { TransactionRow, UserRow } from "./types";

function secondsUntil(deadline: string | null): number {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
}

export type SendSummary = {
  transactionId: string;
  amount: string;
  recipient: string;
  status: TransactionRow["status"];
  secondsUntilUnlock: number;
  collected: boolean;
  createdAt: string | null;
};

function toSummary(row: TransactionRow): SendSummary {
  return {
    transactionId: row.id,
    amount: toAmountString(row.amount_usdc),
    recipient: maskEmail(row.recipient_email),
    status: row.status,
    secondsUntilUnlock: secondsUntil(row.cancel_deadline),
    collected: row.status === "claimed",
    createdAt: row.created_at,
  };
}

const ROW_FIELDS =
  "id, sender_id, recipient_email, amount_usdc, status, cancel_deadline, created_at, claimed_at, circle_tx_id, claim_token";

/**
 * The most recent send from this account to a recipient that has not been
 * collected yet. Used to cancel by recipient when no id is given.
 */
export async function findLatestPendingSend(
  senderUserId: string,
  recipientEmail: string,
): Promise<SendSummary | null> {
  const { data } = await getSupabaseAdmin()
    .from("transactions")
    .select(ROW_FIELDS)
    .eq("sender_id", senderUserId)
    .eq("recipient_email", normaliseEmail(recipientEmail))
    .eq("status", "pending_claim")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<TransactionRow>();

  return data ? toSummary(data) : null;
}

/**
 * Status of one send owned by this account, for the collect status check.
 */
export async function getSendStatus(
  transactionId: string,
  senderUserId: string,
): Promise<SendSummary | null> {
  const { data } = await getSupabaseAdmin()
    .from("transactions")
    .select(ROW_FIELDS)
    .eq("id", transactionId)
    .eq("sender_id", senderUserId)
    .maybeSingle<TransactionRow>();

  return data ? toSummary(data) : null;
}

/**
 * Sends the collection email again for a pending send owned by this account.
 */
export async function resendClaimEmail(
  transactionId: string,
  sender: UserRow,
): Promise<{ ok: boolean; recipient: string; error?: string }> {
  const supabase = getSupabaseAdmin();

  const { data: row } = await supabase
    .from("transactions")
    .select(ROW_FIELDS)
    .eq("id", transactionId)
    .eq("sender_id", sender.id)
    .maybeSingle<TransactionRow>();

  if (!row) {
    throw new Error("No send found with that reference for this account.");
  }
  if (row.status !== "pending_claim") {
    if (row.status === "claimed") {
      throw new Error("That money has already been collected, so there is nothing to resend.");
    }
    if (row.status === "cancelled") {
      throw new Error("That send was called back, so there is nothing to resend.");
    }
    throw new Error("That send is no longer active, so its collection link cannot be resent.");
  }
  if (!row.claim_token) {
    throw new Error("That send has no collection link to resend.");
  }

  const amount = toAmountString(row.amount_usdc);
  const { subject, html } = claimInviteEmail({
    amount,
    senderLabel: maskEmail(sender.email),
    claimUrl: `${appUrl()}/claim/${row.claim_token}`,
    unlocksAt: row.cancel_deadline ? new Date(row.cancel_deadline) : new Date(),
    markUrl: brandMarkUrl(),
  });

  const result = await sendAndLog({
    to: row.recipient_email,
    subject,
    html,
    type: "claim_invite",
    transactionId: row.id,
  });

  return {
    ok: result.ok,
    recipient: maskEmail(row.recipient_email),
    error: result.error,
  };
}
