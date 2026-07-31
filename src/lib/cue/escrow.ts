import "server-only";

import { randomBytes } from "crypto";
import { keccak256 } from "js-sha3";

import { escrowAddress, escrowUnlockSeconds, maxSendUsdc, treasuryWalletId } from "../config";
import { executeContract, readLockedId } from "../circle/contracts";
import { waitForTransaction } from "../circle/wallets";
import { getSupabaseAdmin } from "../supabase/server";
import { findOrCreateUserWithWallet } from "./claim";
import { maskEmail, normaliseEmail, parseAmount, toAmountString } from "./money";
import { assertTreasuryCanCover } from "./send";

/**
 * On-chain escrow flow: the honest, on-chain version of Cue's call back window.
 *
 * The default send path keeps funds in the treasury and treats a call back as a
 * database row update. This module instead locks USDC into the CueEscrow
 * contract on Arc testnet, from the treasury wallet, identifying the recipient
 * only by keccak256 of a claim token (they have no wallet at send time). Before
 * the unlock time the treasury can reclaim; at or after it, the recipient can
 * withdraw to a wallet created at collection.
 *
 * Cue's backend is the only party that submits a withdrawal, and it applies the
 * recipient email check first, so the contract's bearer property is gated off
 * chain. See the README for the security note and the migration path.
 */

export type EscrowDepositRow = {
  id: string;
  sender_id: string | null;
  recipient_email: string;
  amount_usdc: string | number;
  claim_token: string;
  recipient_hash: string;
  onchain_id: string | number;
  unlock_at: string;
  status: "locked" | "reclaimed" | "withdrawn" | "failed";
  lock_tx: string | null;
  reclaim_tx: string | null;
  withdraw_tx: string | null;
  created_at: string | null;
  settled_at: string | null;
};

const FIELDS =
  "id, sender_id, recipient_email, amount_usdc, claim_token, recipient_hash, onchain_id, unlock_at, status, lock_tx, reclaim_tx, withdraw_tx, created_at, settled_at";

function toBaseUnits(amount: string): string {
  // amount is a 6-decimal display string like "0.10"; USDC ERC-20 is 6 decimals.
  return String(Math.round(Number(amount) * 1_000_000));
}

function recipientHashOf(token: string): string {
  return "0x" + keccak256(Buffer.from(token, "utf8"));
}

function humanize(seconds: number): string {
  if (seconds <= 0) return "a moment";
  if (seconds < 60) return `${seconds} seconds`;
  const mins = Math.round(seconds / 60);
  return `about ${mins} minute${mins === 1 ? "" : "s"}`;
}

export type EscrowLockResult = {
  reference: string;
  amount: string;
  recipient: string;
  onchainId: string;
  unlockAt: Date;
  lockTx: string;
};

/**
 * Locks funds in escrow for a recipient known only by a claim token hash.
 */
export async function escrowLock(params: {
  senderUserId: string;
  recipientEmail: string;
  amountUsdc: string | number;
}): Promise<EscrowLockResult> {
  const supabase = getSupabaseAdmin();
  const email = normaliseEmail(params.recipientEmail);
  if (!email.includes("@")) {
    throw new Error(
      `"${params.recipientEmail}" does not look like a valid email address. Check the address and try again.`,
    );
  }

  const amount = parseAmount(params.amountUsdc);
  const cap = maxSendUsdc();
  if (Number(amount) > cap) {
    throw new Error(
      `That is more than the current limit of ${cap.toFixed(2)} dollars per send. Try a smaller amount.`,
    );
  }

  // Escrow locks real treasury funds, so it respects the same floor as a send.
  await assertTreasuryCanCover(amount);

  const token = randomBytes(32).toString("base64url");
  const recipientHash = recipientHashOf(token);
  const unlockAt = new Date(Date.now() + escrowUnlockSeconds() * 1000);
  const unlock = Math.floor(unlockAt.getTime() / 1000);

  const { transactionId } = await executeContract({
    walletId: treasuryWalletId(),
    contractAddress: escrowAddress(),
    abiFunctionSignature: "lock(bytes32,uint256,uint64)",
    abiParameters: [recipientHash, toBaseUnits(amount), String(unlock)],
  });

  const settled = await waitForTransaction(transactionId);
  if (settled.state !== "COMPLETE") {
    throw new Error(
      `The escrow lock did not go through, it ended as ${settled.state}. Nothing was locked, you can try again.`,
    );
  }
  if (!settled.txHash) {
    throw new Error("The escrow lock settled without a transaction hash. Please check again shortly.");
  }

  const onchainId = await readLockedId(settled.txHash, escrowAddress());

  const { data: row, error } = await supabase
    .from("escrow_deposits")
    .insert({
      sender_id: params.senderUserId,
      recipient_email: email,
      amount_usdc: amount,
      claim_token: token,
      recipient_hash: recipientHash,
      onchain_id: onchainId.toString(),
      unlock_at: unlockAt.toISOString(),
      status: "locked",
      lock_tx: settled.txHash,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !row) {
    throw new Error(`Locked on chain but could not record it: ${error?.message ?? "no row returned"}`);
  }

  return {
    reference: row.id,
    amount,
    recipient: email,
    onchainId: onchainId.toString(),
    unlockAt,
    lockTx: settled.txHash,
  };
}

async function getDeposit(reference: string): Promise<EscrowDepositRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("escrow_deposits")
    .select(FIELDS)
    .eq("id", reference)
    .maybeSingle<EscrowDepositRow>();
  return data ?? null;
}

export type EscrowReclaimResult = { amount: string; recipient: string; reclaimTx: string };

/**
 * Returns an escrow deposit to the treasury, before unlock. Sender only.
 */
export async function escrowReclaim(senderUserId: string, reference: string): Promise<EscrowReclaimResult> {
  const dep = await getDeposit(reference);
  if (!dep || dep.sender_id !== senderUserId) {
    throw new Error("I could not find that escrow send for this account. Use its reference from the escrow list.");
  }
  if (dep.status !== "locked") {
    throw new Error(`That escrow send is already ${dep.status}, so there is nothing to call back.`);
  }
  if (Date.now() >= new Date(dep.unlock_at).getTime()) {
    throw new Error(
      "The lock window has passed, so this can no longer be called back. The recipient can now collect it.",
    );
  }

  const { transactionId } = await executeContract({
    walletId: treasuryWalletId(),
    contractAddress: escrowAddress(),
    abiFunctionSignature: "reclaim(uint256)",
    abiParameters: [String(dep.onchain_id)],
  });
  const settled = await waitForTransaction(transactionId);
  if (settled.state !== "COMPLETE" || !settled.txHash) {
    throw new Error(`The call back did not go through (${settled.state}). Nothing changed, you can try again.`);
  }

  await getSupabaseAdmin()
    .from("escrow_deposits")
    .update({ status: "reclaimed", reclaim_tx: settled.txHash, settled_at: new Date().toISOString() })
    .eq("id", dep.id);

  return { amount: toAmountString(dep.amount_usdc), recipient: maskEmail(dep.recipient_email), reclaimTx: settled.txHash };
}

export type EscrowCollectResult = { amount: string; recipient: string; withdrawTx: string };

/**
 * Withdraws an escrow deposit to the recipient's wallet, after unlock. The
 * backend is the only submitter and enforces the recipient email check before
 * it calls the contract, so the bearer withdrawal still passes Cue's own check.
 */
export async function escrowCollect(reference: string, recipientEmail: string): Promise<EscrowCollectResult> {
  const dep = await getDeposit(reference);
  if (!dep) {
    throw new Error("I could not find that escrow send. Use its reference from the escrow list.");
  }
  if (dep.status !== "locked") {
    throw new Error(`That escrow send is already ${dep.status}.`);
  }

  // Email check: the named recipient only. Enforced before we submit anything.
  if (normaliseEmail(recipientEmail) !== normaliseEmail(dep.recipient_email)) {
    throw new Error(
      "That escrow send was addressed to a different email, so it cannot be collected here. Only the named recipient can collect it.",
    );
  }

  const unlockMs = new Date(dep.unlock_at).getTime();
  if (Date.now() < unlockMs) {
    const left = Math.ceil((unlockMs - Date.now()) / 1000);
    throw new Error(
      `This is still locked. It unlocks in ${humanize(left)}, and the sender can call it back until then. Try collecting again after that.`,
    );
  }

  // Create the recipient's wallet at collection, then pay out to it.
  const recipient = await findOrCreateUserWithWallet(dep.recipient_email);
  const preimage = "0x" + Buffer.from(dep.claim_token, "utf8").toString("hex");

  const { transactionId } = await executeContract({
    walletId: treasuryWalletId(),
    contractAddress: escrowAddress(),
    abiFunctionSignature: "withdraw(uint256,bytes,address)",
    abiParameters: [String(dep.onchain_id), preimage, recipient.circle_wallet_address as string],
  });
  const settled = await waitForTransaction(transactionId);
  if (settled.state !== "COMPLETE" || !settled.txHash) {
    throw new Error(`The withdrawal did not go through (${settled.state}). Nothing changed, you can try again.`);
  }

  await getSupabaseAdmin()
    .from("escrow_deposits")
    .update({ status: "withdrawn", withdraw_tx: settled.txHash, settled_at: new Date().toISOString() })
    .eq("id", dep.id);

  return { amount: toAmountString(dep.amount_usdc), recipient: maskEmail(dep.recipient_email), withdrawTx: settled.txHash };
}

export type EscrowView = {
  reference: string;
  amount: string;
  recipient: string;
  status: EscrowDepositRow["status"];
  unlockAt: string;
  lockTx: string | null;
  reclaimTx: string | null;
  withdrawTx: string | null;
};

/**
 * The account's escrow deposits, newest first, for a status panel.
 */
export async function listEscrow(senderUserId: string, limit = 10): Promise<EscrowView[]> {
  const { data } = await getSupabaseAdmin()
    .from("escrow_deposits")
    .select(FIELDS)
    .eq("sender_id", senderUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as EscrowDepositRow[]).map((d) => ({
    reference: d.id,
    amount: toAmountString(d.amount_usdc),
    recipient: maskEmail(d.recipient_email),
    status: d.status,
    unlockAt: d.unlock_at,
    lockTx: d.lock_tx,
    reclaimTx: d.reclaim_tx,
    withdrawTx: d.withdraw_tx,
  }));
}
