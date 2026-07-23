/**
 * Circle wallet layer test against Arc Testnet.
 *
 * Creates a "cue-dev" wallet set, then a treasury wallet and a test recipient
 * wallet, and prints their ids, addresses and USDC balances.
 *
 * Run with:
 *   npx tsx --conditions=react-server scripts/test-circle.ts
 *
 * Note: this creates real testnet wallets on the Circle account.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import {
  createWallet,
  createWalletSet,
  getWalletBalance,
} from "../src/lib/circle/wallets";

async function main() {
  console.log("Creating wallet set 'cue-dev' on Arc Testnet...");
  const walletSet = await createWalletSet("cue-dev");
  console.log(`  walletSetId: ${walletSet.id}`);
  console.log("");

  const treasury = await createWallet(walletSet.id, "treasury");
  const recipient = await createWallet(walletSet.id, "test-recipient");

  for (const [label, wallet] of [
    ["treasury", treasury],
    ["test-recipient", recipient],
  ] as const) {
    const balance = await getWalletBalance(wallet.id);
    console.log(`${label}`);
    console.log(`  id:         ${wallet.id}`);
    console.log(`  address:    ${wallet.address}`);
    console.log(`  blockchain: ${wallet.blockchain}`);
    console.log(`  balance:    ${balance.amount} USDC`);
    console.log("");
  }

  console.log("Circle OK");
  console.log("");
  console.log("Fund this treasury address from the Circle Arc Testnet faucet:");
  console.log(treasury.address);
}

main().catch((error) => {
  console.error("Circle FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
