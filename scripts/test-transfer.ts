/**
 * End to end USDC transfer test on Arc Testnet.
 *
 * Sends 1 USDC from the treasury wallet to the test recipient wallet, polls the
 * transaction to a terminal state, then prints both balances.
 *
 * Run with:
 *   npx tsx --conditions=react-server scripts/test-transfer.ts
 *
 * Wallet ids come from the scripts/test-circle.ts run. Override with env vars
 * to point the test at different wallets.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import {
  getWalletBalance,
  transferUsdc,
  waitForTransaction,
} from "../src/lib/circle/wallets";

const TREASURY_WALLET_ID =
  process.env.TREASURY_WALLET_ID ?? "5d3c46a7-164b-5fa6-b610-03217f762211";

const RECIPIENT_WALLET_ID =
  process.env.RECIPIENT_WALLET_ID ?? "976caa21-6ad4-5283-859d-0db2d7e1d58e";

const RECIPIENT_ADDRESS =
  process.env.RECIPIENT_ADDRESS ??
  "0x4c7fc0df45dafe1190c499d0083a0ca54cae297b";

const AMOUNT_USDC = "1";

async function printBalances(label: string) {
  const [treasury, recipient] = await Promise.all([
    getWalletBalance(TREASURY_WALLET_ID),
    getWalletBalance(RECIPIENT_WALLET_ID),
  ]);

  console.log(label);
  console.log(`  treasury:       ${treasury.amount} USDC`);
  console.log(`  test-recipient: ${recipient.amount} USDC`);
  console.log("");

  return { treasury, recipient };
}

async function main() {
  const before = await printBalances("Balances before transfer");

  if (Number(before.treasury.amount) < Number(AMOUNT_USDC)) {
    console.error(
      `Treasury holds ${before.treasury.amount} USDC, which is not enough to send ${AMOUNT_USDC}. Fund it from the Circle Arc Testnet faucet first.`,
    );
    process.exit(1);
  }

  console.log(`Sending ${AMOUNT_USDC} USDC to ${RECIPIENT_ADDRESS} ...`);
  const { transactionId } = await transferUsdc(
    TREASURY_WALLET_ID,
    RECIPIENT_ADDRESS,
    AMOUNT_USDC,
  );

  console.log(`  circle transaction id: ${transactionId}`);
  console.log("");

  console.log("Polling for terminal state ...");
  const startedAt = Date.now();

  const tx = await waitForTransaction(transactionId, {
    timeoutMs: 120_000,
    pollIntervalMs: 2_000,
    onState: (current) => {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`  [${elapsed}s] ${current.state}`);
    },
  });

  console.log("");
  console.log("Final transaction");
  console.log(`  id:          ${tx.id}`);
  console.log(`  state:       ${tx.state}`);
  if (tx.txHash) console.log(`  txHash:      ${tx.txHash}`);
  if (tx.networkFee) console.log(`  networkFee:  ${tx.networkFee} USDC`);
  if (tx.errorReason) console.log(`  errorReason: ${tx.errorReason}`);
  if (tx.errorDetails) console.log(`  errorDetail: ${tx.errorDetails}`);
  console.log("");

  if (tx.state !== "COMPLETE") {
    console.error(`Transfer FAILED, ended in state ${tx.state}.`);
    await printBalances("Balances after transfer");
    process.exit(1);
  }

  await printBalances("Balances after transfer");
  console.log("Transfer OK");
}

main().catch((error) => {
  console.error("Transfer FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
