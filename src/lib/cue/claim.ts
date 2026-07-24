import "server-only";

import { createWallet, transferUsdc, waitForTransaction } from "../circle/wallets";
import { circleWalletSetId, treasuryWalletId } from "../config";
import { claimConfirmationEmail } from "../email/templates";
import { sendAndLog } from "../email/send";
import { getSupabaseAdmin } from "../supabase/server";
import { normaliseEmail, toAmountString } from "./money";
import type { EmailResult } from "../email/send";
import type { TransactionRow, UserRow } from "./types";

export type ClaimResult = {
  transactionId: string;
  amount: string;
  circleTxId: string;
  txHash?: string;
  recipientWalletId: string;
  recipientWalletAddress: string;
  email: EmailResult;
};

/**
 * Collects a pending send.
 *
 * Ordering matters here. The recipient wallet is prepared first, then the row
 * is moved out of pending_claim with a single conditional update, and only then
 * does money move. That ordering means a double submit or a cancel racing the
 * claim cannot both succeed, and a wallet creation failure does not leave the
 * row locked.
 */
export async function claimSend(params: {
  claimToken: string;
  recipientEmail: string;
}): Promise<ClaimResult> {
  const supabase = getSupabaseAdmin();
  const recipientEmail = normaliseEmail(params.recipientEmail);

  if (!params.claimToken) {
    throw new Error("A claim link is required.");
  }

  const { data: transaction, error: lookupError } = await supabase
    .from("transactions")
    .select(
      "id, sender_id, recipient_email, amount_usdc, status, cancel_deadline, claim_token",
    )
    .eq("claim_token", params.claimToken)
    .maybeSingle<TransactionRow>();

  if (lookupError) {
    throw new Error(`Could not look up this link: ${lookupError.message}`);
  }
  if (!transaction) {
    throw new Error("This link is not valid.");
  }

  if (transaction.status === "claimed") {
    throw new Error("This money has already been collected.");
  }
  if (transaction.status === "cancelled") {
    throw new Error("The sender called this money back.");
  }
  if (transaction.status !== "pending_claim") {
    throw new Error(`This link cannot be used, its status is ${transaction.status}.`);
  }

  if (normaliseEmail(transaction.recipient_email) !== recipientEmail) {
    throw new Error("This link was sent to a different email address.");
  }

  const unlocksAt = transaction.cancel_deadline
    ? new Date(transaction.cancel_deadline)
    : null;

  if (unlocksAt && Date.now() < unlocksAt.getTime()) {
    const seconds = Math.ceil((unlocksAt.getTime() - Date.now()) / 1000);
    throw new Error(
      `This money is not available yet. It unlocks in ${seconds} second(s), at ${unlocksAt.toISOString()}.`,
    );
  }

  const amount = toAmountString(transaction.amount_usdc);

  // Prepare the destination before locking the row.
  const recipient = await findOrCreateUserWithWallet(recipientEmail);

  // Conditional update. If another claim or a cancel already moved this row,
  // no row comes back and this attempt stops here.
  const { data: locked, error: lockError } = await supabase
    .from("transactions")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", transaction.id)
    .eq("status", "pending_claim")
    .select("id")
    .maybeSingle<Pick<TransactionRow, "id">>();

  if (lockError) {
    throw new Error(`Could not reserve this money: ${lockError.message}`);
  }
  if (!locked) {
    throw new Error(
      "This money was just collected or called back. Nothing was moved.",
    );
  }

  let circleTxId: string;
  try {
    const transfer = await transferUsdc(
      treasuryWalletId(),
      recipient.circle_wallet_address as string,
      amount,
    );
    circleTxId = transfer.transactionId;
  } catch (error) {
    // No transfer was created, so the money never left. Safe to release.
    await releaseClaim(transaction.id);
    throw new Error(
      `Could not start the transfer, nothing was moved: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Record the id straight away. If anything later fails, the transfer is still
  // traceable rather than orphaned.
  await supabase
    .from("transactions")
    .update({ circle_tx_id: circleTxId })
    .eq("id", transaction.id);

  let txHash: string | undefined;
  try {
    const settled = await waitForTransaction(circleTxId);

    if (settled.state !== "COMPLETE") {
      // A terminal failure means the money did not move, so the send can be
      // attempted again.
      await releaseClaim(transaction.id);
      throw new Error(
        `The transfer did not go through, it ended as ${settled.state}${
          settled.errorReason ? ` (${settled.errorReason})` : ""
        }. Nothing was taken from the sender, you can try again.`,
      );
    }

    txHash = settled.txHash;
  } catch (error) {
    // A timeout is not a failure. The transfer may still settle, so the row
    // stays claimed to avoid paying twice.
    if (error instanceof Error && error.message.includes("did not reach a terminal state")) {
      throw new Error(
        `The transfer is taking longer than expected and is still settling. It is recorded as ${circleTxId}, please check again shortly rather than retrying.`,
      );
    }
    throw error;
  }

  const { subject, html } = claimConfirmationEmail({ amount });
  const email = await sendAndLog({
    to: recipientEmail,
    subject,
    html,
    type: "claim_confirmation",
    transactionId: transaction.id,
  });

  return {
    transactionId: transaction.id,
    amount,
    circleTxId,
    txHash,
    recipientWalletId: recipient.circle_wallet_id as string,
    recipientWalletAddress: recipient.circle_wallet_address as string,
    email,
  };
}

/**
 * Puts a reserved row back into pending_claim after a transfer that provably
 * never moved money.
 */
async function releaseClaim(transactionId: string): Promise<void> {
  await getSupabaseAdmin()
    .from("transactions")
    .update({ status: "pending_claim", claimed_at: null })
    .eq("id", transactionId)
    .eq("status", "claimed");
}

/**
 * Looks up a user by email, creating both the user and their wallet when this
 * is the first time Cue has seen the address.
 */
export async function findOrCreateUserWithWallet(
  email: string,
): Promise<UserRow> {
  const supabase = getSupabaseAdmin();
  const normalised = normaliseEmail(email);

  // upsert rather than select then insert, so two concurrent claims for a new
  // address cannot both try to insert and trip the unique constraint.
  const { data: user, error } = await supabase
    .from("users")
    .upsert({ email: normalised }, { onConflict: "email" })
    .select("id, email, circle_wallet_id, circle_wallet_address, created_at")
    .single<UserRow>();

  if (error || !user) {
    throw new Error(
      `Could not prepare the recipient account: ${error?.message ?? "no row returned"}`,
    );
  }

  if (user.circle_wallet_id && user.circle_wallet_address) {
    return user;
  }

  const wallet = await createWallet(circleWalletSetId(), user.id);

  const { data: updated, error: updateError } = await supabase
    .from("users")
    .update({
      circle_wallet_id: wallet.id,
      circle_wallet_address: wallet.address,
    })
    .eq("id", user.id)
    .select("id, email, circle_wallet_id, circle_wallet_address, created_at")
    .single<UserRow>();

  if (updateError || !updated) {
    throw new Error(
      `Created an account but could not save it: ${updateError?.message ?? "no row returned"}`,
    );
  }

  return updated;
}

/**
 * Read only view of a claim link, for the claim page before anything is
 * collected. Returns null when the token matches nothing.
 */
export async function getClaimInfo(claimToken: string): Promise<{
  amount: string;
  status: string;
  senderLabel: string;
  unlocksAt: string | null;
  secondsUntilUnlock: number;
  claimable: boolean;
} | null> {
  const supabase = getSupabaseAdmin();

  const { data: transaction } = await supabase
    .from("transactions")
    .select("id, sender_id, amount_usdc, status, cancel_deadline")
    .eq("claim_token", claimToken)
    .maybeSingle<TransactionRow>();

  if (!transaction) return null;

  let senderLabel = "Someone";
  if (transaction.sender_id) {
    const { data: sender } = await supabase
      .from("users")
      .select("email")
      .eq("id", transaction.sender_id)
      .maybeSingle<Pick<UserRow, "email">>();

    if (sender?.email) {
      const { maskEmail } = await import("./money");
      senderLabel = maskEmail(sender.email);
    }
  }

  const unlocksAt = transaction.cancel_deadline
    ? new Date(transaction.cancel_deadline)
    : null;

  const secondsUntilUnlock = unlocksAt
    ? Math.max(0, Math.ceil((unlocksAt.getTime() - Date.now()) / 1000))
    : 0;

  return {
    amount: toAmountString(transaction.amount_usdc),
    status: transaction.status,
    senderLabel,
    unlocksAt: unlocksAt ? unlocksAt.toISOString() : null,
    secondsUntilUnlock,
    claimable:
      transaction.status === "pending_claim" && secondsUntilUnlock === 0,
  };
}
