/**
 * Proves the app-layer escrow path end to end against the live contract and DB:
 * escrowLock -> escrowReclaim (deposit A), and escrowLock -> escrowCollect after
 * unlock (deposit B), including the recipient email check. Uses the real
 * functions the MCP `escrow` tool calls.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { escrowLock, escrowReclaim, escrowCollect } from "../../src/lib/cue/escrow";
import { findOrCreateUserByEmail } from "../../src/lib/cue/users";

config({ path: ".env.local" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = randomBytes(3).toString("hex");

async function main() {
  const sender = await findOrCreateUserByEmail(`cue-escrow-sender-${stamp}@mailinator.com`);
  const rcptA = `cue-escrow-a-${stamp}@mailinator.com`;
  const rcptB = `cue-escrow-b-${stamp}@mailinator.com`;

  console.log("A. lock then reclaim before unlock");
  const a = await escrowLock({ senderUserId: sender.id, recipientEmail: rcptA, amountUsdc: 0.1 });
  console.log("  locked:", a.reference, "lockTx", a.lockTx);
  const ar = await escrowReclaim(sender.id, a.reference);
  console.log("  reclaimTx", ar.reclaimTx);

  console.log("\nB. lock, verify email check, wait, then collect after unlock");
  const b = await escrowLock({ senderUserId: sender.id, recipientEmail: rcptB, amountUsdc: 0.1 });
  console.log("  locked:", b.reference, "lockTx", b.lockTx);

  try {
    await escrowCollect(b.reference, "wrong@example.com");
    console.log("  EMAIL CHECK FAILED: wrong email was allowed");
  } catch (e) {
    console.log("  email check refused wrong email:", e instanceof Error ? e.message : e);
  }

  const waitMs = new Date(b.unlockAt).getTime() - Date.now() + 4000;
  if (waitMs > 0) {
    console.log(`  waiting ${Math.ceil(waitMs / 1000)}s for unlock ...`);
    await sleep(waitMs);
  }
  const bc = await escrowCollect(b.reference, rcptB);
  console.log("  withdrawTx", bc.withdrawTx, "to", bc.recipient);

  console.log("\nAPP-LAYER OK");
  console.log(JSON.stringify({ lockA: a.lockTx, reclaimA: ar.reclaimTx, lockB: b.lockTx, withdrawB: bc.withdrawTx }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
