import "server-only";

import { transferUsdc, waitForTransaction } from "../circle/wallets";
import {
  fundAccountCapUsdc,
  fundAmountUsdc,
  fundCooldownSeconds,
  treasuryWalletId,
} from "../config";
import { getSupabaseAdmin } from "../supabase/server";
import { findOrCreateUserWithWallet } from "./claim";
import { addAmounts, normaliseEmail, toAmountString } from "./money";
import { alertIfLow, assertTreasuryCanCover } from "./send";
import type { TransactionRow, UserRow } from "./types";

export type FundResult = {
  transactionId: string;
  amount: string;
  circleTxId: string;
  txHash?: string;
};

/**
 * Grants a fixed amount of test funds to the account's own wallet from the demo
 * pool, on testnet. There is no real on ramp: this is the placeholder until
 * mainnet funding through Circle.
 *
 * Three caps stop a signup loop from draining the pool, on top of the treasury
 * floor and daily cap that every outflow already respects: a fixed grant per
 * request, a lifetime total per account, and a cooldown between grants. The row
 * is recorded before the transfer so a second request in the same moment is
 * refused rather than paid twice, and it is removed again if the transfer never
 * moves money.
 */
export async function addTestFunds(user: UserRow): Promise<FundResult> {
  const supabase = getSupabaseAdmin();
  const email = normaliseEmail(user.email);
  const amount = fundAmountUsdc().toFixed(2);

  // Make sure there is somewhere for the funds to land. A freshly signed in
  // account may not have a wallet yet; this creates one the first time.
  const account = await findOrCreateUserWithWallet(email);
  if (!account.circle_wallet_address) {
    throw new Error(
      "We could not prepare your account to receive funds. Please try again in a moment.",
    );
  }

  // Everything this account has been granted so far. Used for both the cooldown
  // and the lifetime cap.
  const { data: priorRows, error: priorError } = await supabase
    .from("transactions")
    .select("amount_usdc, created_at")
    .eq("recipient_email", email)
    .eq("kind", "funding")
    .order("created_at", { ascending: false });

  if (priorError) {
    throw new Error(`Could not check your test funds history: ${priorError.message}`);
  }

  const prior = priorRows ?? [];

  // Cooldown: a short wait between grants so it cannot be looped.
  const cooldown = fundCooldownSeconds();
  const last = prior[0]?.created_at ? new Date(prior[0].created_at as string).getTime() : 0;
  const waited = Math.floor((Date.now() - last) / 1000);
  if (last && waited < cooldown) {
    const left = cooldown - waited;
    const mins = Math.ceil(left / 60);
    const when = left >= 60 ? `about ${mins} minute${mins === 1 ? "" : "s"}` : `${left} seconds`;
    throw new Error(
      `You just added test funds. You can add more in ${when}. In the meantime you have enough to try sending, splitting or requesting.`,
    );
  }

  // Lifetime cap: a hard ceiling on how much any one account can be granted.
  const granted = prior.reduce(
    (total, row) => addAmounts(total, toAmountString(row.amount_usdc)),
    "0.00",
  );
  if (Number(addAmounts(granted, amount)) > fundAccountCapUsdc()) {
    throw new Error(
      "This account has reached the test funds limit for the demo. You already have enough to try sending, splitting and requesting with Claude.",
    );
  }

  // Same guards as a send: the floor keeps the pool from ever emptying, and the
  // daily cap limits total outflow per day. These throw a plain message.
  const treasury = await assertTreasuryCanCover(amount);

  // Record the grant before moving money, so a racing second request sees it and
  // is held off by the cooldown rather than paid twice.
  const { data: inserted, error: insertError } = await supabase
    .from("transactions")
    .insert({
      sender_id: null,
      recipient_email: email,
      amount_usdc: amount,
      status: "claimed",
      kind: "funding",
      claimed_at: new Date().toISOString(),
    })
    .select("id")
    .single<Pick<TransactionRow, "id">>();

  if (insertError || !inserted) {
    throw new Error(
      `Could not start adding funds: ${insertError?.message ?? "no row returned"}`,
    );
  }

  let circleTxId: string;
  try {
    const transfer = await transferUsdc(
      treasuryWalletId(),
      account.circle_wallet_address,
      amount,
    );
    circleTxId = transfer.transactionId;
  } catch (error) {
    // No transfer was created, so nothing moved. Remove the record so it does
    // not count against the cap or the cooldown.
    await supabase.from("transactions").delete().eq("id", inserted.id);
    throw new Error(
      `Could not add funds right now, nothing changed: ${
        error instanceof Error ? error.message : String(error)
      }. Please try again in a moment.`,
    );
  }

  await supabase
    .from("transactions")
    .update({ circle_tx_id: circleTxId })
    .eq("id", inserted.id);

  let txHash: string | undefined;
  try {
    const settled = await waitForTransaction(circleTxId);
    if (settled.state !== "COMPLETE") {
      await supabase.from("transactions").delete().eq("id", inserted.id);
      throw new Error(
        `The funding did not go through, it ended as ${settled.state}${
          settled.errorReason ? ` (${settled.errorReason})` : ""
        }. Nothing was added, you can try again.`,
      );
    }
    txHash = settled.txHash;
  } catch (error) {
    // A timeout is not a failure: the funds may still land, so the record stays.
    if (error instanceof Error && error.message.includes("did not reach a terminal state")) {
      throw new Error(
        "Adding your funds is taking longer than expected and is still settling. Check your balance again shortly rather than adding again.",
      );
    }
    throw error;
  }

  // Warn the operator if the pool is running low. Never blocks the grant.
  await alertIfLow(treasury.balance, addAmounts(treasury.committed, amount));

  return { transactionId: inserted.id, amount, circleTxId, txHash };
}
