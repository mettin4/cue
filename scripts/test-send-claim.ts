/**
 * Full send, claim and cancel loop against Arc Testnet and real email.
 *
 * Run with:
 *   npx tsx --conditions=react-server scripts/test-send-claim.ts you@example.com
 *
 * The recipient address must be the Resend account owner while the project is
 * on Resend's shared onboarding domain, since test mode refuses anyone else.
 *
 * Uses a 10 second cancel window instead of the 1 hour default so the unlock
 * can actually be waited out.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import { getWalletBalance } from "../src/lib/circle/wallets";
import { treasuryWalletId } from "../src/lib/config";
import { cancelSend } from "../src/lib/cue/cancel";
import { claimSend, getClaimInfo } from "../src/lib/cue/claim";
import { createSend } from "../src/lib/cue/send";
import { getSupabaseAdmin } from "../src/lib/supabase/server";

const CANCEL_WINDOW_SECONDS = 10;
const SENDER_EMAIL = "sender@cue.test";

const recipientEmail = process.argv[2] ?? process.env.TEST_EMAIL;

function step(n: string, title: string) {
  console.log("");
  console.log(`--- ${n}. ${title} ---`);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureSender(): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .upsert({ email: SENDER_EMAIL }, { onConflict: "email" })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(`Could not create the test sender: ${error?.message}`);
  }
  return data.id;
}

async function main() {
  if (!recipientEmail) {
    console.error(
      "Pass the recipient email: npx tsx --conditions=react-server scripts/test-send-claim.ts you@example.com",
    );
    process.exit(1);
  }

  console.log(`Recipient:      ${recipientEmail}`);
  console.log(`Cancel window:  ${CANCEL_WINDOW_SECONDS}s (default is 1 hour)`);

  step("1", "Prepare sender and read treasury");
  const senderId = await ensureSender();
  console.log(`sender user id: ${senderId}`);
  const treasuryBefore = await getWalletBalance(treasuryWalletId());
  console.log(`treasury:       ${treasuryBefore.amount} USDC`);

  step("2", "Create send of 1.50 dollars");
  const send = await createSend({
    senderUserId: senderId,
    recipientEmail,
    amountUsdc: "1.50",
    cancelWindowSeconds: CANCEL_WINDOW_SECONDS,
  });
  console.log(`transaction id: ${send.transactionId}`);
  console.log(`amount:         ${send.amount}`);
  console.log(`claim url:      ${send.claimUrl}`);
  console.log(`unlocks at:     ${send.cancelDeadline.toISOString()}`);
  console.log(`email sent:     ${send.email.ok}${send.email.error ? ` (${send.email.error})` : ""}`);
  if (send.email.resendId) console.log(`resend id:      ${send.email.resendId}`);

  step("3", "Claim info while still locked");
  const locked = await getClaimInfo(send.claimToken);
  console.log(`status:         ${locked?.status}`);
  console.log(`sender shown:   ${locked?.senderLabel}`);
  console.log(`claimable:      ${locked?.claimable}`);
  console.log(`unlocks in:     ${locked?.secondsUntilUnlock}s`);

  step("4", "Claim too early, should be refused");
  try {
    await claimSend({ claimToken: send.claimToken, recipientEmail });
    console.log("UNEXPECTED: the early claim succeeded");
    process.exit(1);
  } catch (error) {
    console.log(`refused: ${error instanceof Error ? error.message : error}`);
  }

  step("5", "Claim with the wrong email, should be refused");
  try {
    await claimSend({
      claimToken: send.claimToken,
      recipientEmail: "someone-else@cue.test",
    });
    console.log("UNEXPECTED: the wrong email claim succeeded");
    process.exit(1);
  } catch (error) {
    console.log(`refused: ${error instanceof Error ? error.message : error}`);
  }

  step("6", `Wait ${CANCEL_WINDOW_SECONDS}s for unlock`);
  await sleep((CANCEL_WINDOW_SECONDS + 2) * 1000);
  const unlocked = await getClaimInfo(send.claimToken);
  console.log(`claimable:      ${unlocked?.claimable}`);

  step("7", "Claim the money");
  const claim = await claimSend({ claimToken: send.claimToken, recipientEmail });
  console.log(`amount:         ${claim.amount}`);
  console.log(`circle tx id:   ${claim.circleTxId}`);
  console.log(`tx hash:        ${claim.txHash}`);
  console.log(`recipient wal:  ${claim.recipientWalletId}`);
  console.log(`recipient addr: ${claim.recipientWalletAddress}`);
  console.log(`email sent:     ${claim.email.ok}`);

  step("8", "Verify on chain");
  const recipientBalance = await getWalletBalance(claim.recipientWalletId);
  const treasuryAfter = await getWalletBalance(treasuryWalletId());
  console.log(`recipient:      ${recipientBalance.amount} USDC`);
  console.log(`treasury:       ${treasuryAfter.amount} USDC`);
  if (Number(recipientBalance.amount) < Number(claim.amount)) {
    console.error("UNEXPECTED: recipient balance is below the claimed amount");
    process.exit(1);
  }
  console.log("recipient received the money on chain");

  step("9", "Double claim, should be refused");
  try {
    await claimSend({ claimToken: send.claimToken, recipientEmail });
    console.log("UNEXPECTED: the second claim succeeded");
    process.exit(1);
  } catch (error) {
    console.log(`refused: ${error instanceof Error ? error.message : error}`);
  }

  step("10", "Second send, then cancel it");
  const second = await createSend({
    senderUserId: senderId,
    recipientEmail,
    amountUsdc: "2.25",
    cancelWindowSeconds: CANCEL_WINDOW_SECONDS,
  });
  console.log(`transaction id: ${second.transactionId}`);
  console.log(`amount:         ${second.amount}`);
  console.log(`email sent:     ${second.email.ok}`);

  const cancelled = await cancelSend({
    transactionId: second.transactionId,
    senderUserId: senderId,
  });
  console.log(`cancelled:      ${cancelled.transactionId}`);
  console.log(`recipient told: ${cancelled.email?.ok}`);

  step("11", "Claim a cancelled send, should be refused");
  await sleep((CANCEL_WINDOW_SECONDS + 2) * 1000);
  try {
    await claimSend({ claimToken: second.claimToken, recipientEmail });
    console.log("UNEXPECTED: claiming a cancelled send succeeded");
    process.exit(1);
  } catch (error) {
    console.log(`refused: ${error instanceof Error ? error.message : error}`);
  }

  step("12", "Cancel a send that was already collected, should be refused");
  try {
    await cancelSend({
      transactionId: send.transactionId,
      senderUserId: senderId,
    });
    console.log("UNEXPECTED: cancelling a collected send succeeded");
    process.exit(1);
  } catch (error) {
    console.log(`refused: ${error instanceof Error ? error.message : error}`);
  }

  console.log("");
  console.log("Send and claim core OK");
}

main().catch((error) => {
  console.error("");
  console.error("Test FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
