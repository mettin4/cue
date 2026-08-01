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
import { alertIfLow, assertTreasuryCanCover, TreasuryUnavailableError } from "./send";
import type { TransactionRow, UserRow } from "./types";

export type FundResult = {
  transactionId: string;
  amount: string;
  circleTxId: string;
  txHash?: string;
};

/**
 * Why a test funds grant is not available right now. Each message is written for
 * the funding situation, never inherited from the send path, and says something
 * the person can actually act on. There is no amount to choose here, so nothing
 * ever suggests a smaller one.
 */
export type FundBlockReason = "cooldown" | "account_maxed" | "pool_empty" | "daily_reached";

type FundCheck =
  | { ok: false; reason: FundBlockReason; message: string }
  | { ok: true; treasury: { balance: string; committed: string } };

/**
 * Runs every gate a grant must pass, without creating a wallet or moving money,
 * so the same logic backs both the grant itself and whether the Add button is
 * offered at all. Returns the treasury figures on success so the caller does not
 * read them twice.
 */
async function checkFunding(email: string, amount: string): Promise<FundCheck> {
  const supabase = getSupabaseAdmin();

  const { data: priorRows, error } = await supabase
    .from("transactions")
    .select("amount_usdc, created_at")
    .eq("recipient_email", email)
    .eq("kind", "funding")
    .order("created_at", { ascending: false });

  if (error) {
    // Surface a plain, funding specific message rather than a database detail.
    throw new Error("We could not check your test funds right now. Please try again in a moment.");
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
    return {
      ok: false,
      reason: "cooldown",
      message: `You just added test funds. You can add more in ${when}. In the meantime you have enough to try sending, splitting or requesting.`,
    };
  }

  // Lifetime cap: a hard ceiling on how much any one account can be granted.
  const granted = prior.reduce((total, row) => addAmounts(total, toAmountString(row.amount_usdc)), "0.00");
  if (Number(addAmounts(granted, amount)) > fundAccountCapUsdc()) {
    return {
      ok: false,
      reason: "account_maxed",
      message:
        "This account has reached the test funds limit for the demo. You already have enough to try sending, splitting and requesting with Claude.",
    };
  }

  // The pool must be able to cover the grant. The treasury guard is shared with
  // the send path, so translate its outcome into funding copy: there is nothing
  // to add right now, and it is not about picking a different amount.
  try {
    const treasury = await assertTreasuryCanCover(amount);
    return { ok: true, treasury };
  } catch (error) {
    if (error instanceof TreasuryUnavailableError) {
      if (error.reason === "floor") {
        return {
          ok: false,
          reason: "pool_empty",
          message:
            "The demo pool is temporarily out of test funds. It gets topped up, so please come back a little later.",
        };
      }
      return {
        ok: false,
        reason: "daily_reached",
        message: "The demo has given out all the test funds it can for today. Please come back tomorrow.",
      };
    }
    throw error;
  }
}

export type FundingAvailability =
  | { available: true }
  | { available: false; reason: FundBlockReason; message: string };

/**
 * Whether a grant would be accepted right now, for deciding if the Add button is
 * offered. Never throws: an unexpected read problem leaves the button enabled so
 * the person can still try, and the attempt surfaces the real error.
 */
export async function getFundingAvailability(user: UserRow): Promise<FundingAvailability> {
  try {
    const check = await checkFunding(normaliseEmail(user.email), fundAmountUsdc().toFixed(2));
    return check.ok ? { available: true } : { available: false, reason: check.reason, message: check.message };
  } catch {
    return { available: true };
  }
}

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

  // Every gate first, before creating a wallet or moving anything. On failure the
  // message is already written for funding.
  const check = await checkFunding(email, amount);
  if (!check.ok) throw new Error(check.message);

  // Make sure there is somewhere for the funds to land. A freshly signed in
  // account may not have a wallet yet; this creates one the first time.
  const account = await findOrCreateUserWithWallet(email);
  if (!account.circle_wallet_address) {
    throw new Error("We could not prepare your account to receive funds. Please try again in a moment.");
  }

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
    throw new Error("We could not start adding funds right now. Please try again in a moment.");
  }

  let circleTxId: string;
  try {
    const transfer = await transferUsdc(treasuryWalletId(), account.circle_wallet_address, amount);
    circleTxId = transfer.transactionId;
  } catch {
    // No transfer was created, so nothing moved. Remove the record so it does not
    // count against the cap or the cooldown. Keep the message plain and funding
    // specific rather than surfacing a lower level detail.
    await supabase.from("transactions").delete().eq("id", inserted.id);
    throw new Error("We could not add funds right now, so nothing changed. Please try again in a moment.");
  }

  await supabase.from("transactions").update({ circle_tx_id: circleTxId }).eq("id", inserted.id);

  let txHash: string | undefined;
  try {
    const settled = await waitForTransaction(circleTxId);
    if (settled.state !== "COMPLETE") {
      await supabase.from("transactions").delete().eq("id", inserted.id);
      throw new Error("The funds did not go through, so nothing was added. Please try again.");
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
  await alertIfLow(check.treasury.balance, addAmounts(check.treasury.committed, amount));

  return { transactionId: inserted.id, amount, circleTxId, txHash };
}
