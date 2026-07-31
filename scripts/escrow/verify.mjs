/**
 * Proves CueEscrow on Arc testnet with real transactions:
 *   0. one-time treasury approve so the escrow can pull USDC
 *   A. lock, then reclaim before unlock  (sender gets funds back)
 *   B. lock with a short unlock, wait past it, then withdraw  (recipient path)
 * Prints every transaction hash with explorer links.
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "js-sha3";
const { keccak256 } = pkg;
import { randomBytes } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

config({ path: ".env.local" });

const here = dirname(fileURLToPath(import.meta.url));
const dep = JSON.parse(readFileSync(join(here, "deployment.json"), "utf8"));
const ESCROW = dep.address;
const USDC = dep.usdc;
const CHAIN = "ARC-TESTNET";
const EX = (h) => `https://testnet.arcscan.app/tx/${h}`;

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
const walletId = process.env.TREASURY_WALLET_ID;
const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS;

const dcw = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const scp = initiateSmartContractPlatformClient({ apiKey, entitySecret });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const AMOUNT = "100000"; // 0.10 USDC, 6 decimals

// Calls a method on an arbitrary contract address and waits for it to settle.
async function callAddr(label, address, sig, params) {
  const res = await dcw.createContractExecutionTransaction({
    walletId,
    contractAddress: address,
    abiFunctionSignature: sig,
    abiParameters: params,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = res.data?.id;
  let txHash, state;
  for (let i = 0; i < 60; i++) {
    const t = await dcw.getTransaction({ id });
    const tx = t.data?.transaction;
    state = tx?.state;
    txHash = tx?.txHash;
    if (state === "COMPLETE") break;
    if (["FAILED", "DENIED", "CANCELLED"].includes(state)) {
      throw new Error(`${label} ended ${state}: ${tx?.errorReason ?? ""} ${tx?.errorDetails ?? ""}`);
    }
    await sleep(2500);
  }
  console.log(`  ${label}: ${state}  ${txHash}`);
  console.log(`     ${EX(txHash)}`);
  return { txHash, state };
}

function recipientOf(token) {
  const bytes = Buffer.from(token, "utf8");
  return { hash: "0x" + keccak256(bytes), preimage: "0x" + bytes.toString("hex") };
}

async function readNextId() {
  try {
    const r = await scp.queryContract({ address: ESCROW, blockchain: CHAIN, abiFunctionSignature: "nextId()" });
    const out = r.data?.outputValues ?? r.data?.outputData ?? r.data;
    console.log("  nextId read:", JSON.stringify(out));
  } catch (e) {
    console.log("  nextId read skipped:", e?.message ?? e);
  }
}

async function main() {
  console.log("CueEscrow", ESCROW, "USDC", USDC);
  const hashes = {};

  console.log("\n0. one-time approve (treasury -> escrow, 1000 USDC allowance)");
  hashes.approve = (await callAddr("approve", USDC, "approve(address,uint256)", [ESCROW, "1000000000"])).txHash;

  await readNextId();

  // Deposit A: lock then reclaim before unlock. Long unlock so it stays locked.
  const tokenA = randomBytes(32).toString("base64url");
  const A = recipientOf(tokenA);
  const unlockA = Math.floor(Date.now() / 1000) + 3600;
  console.log("\nA. lock (id 0), long unlock, then reclaim before unlock");
  hashes.lockA = (await callAddr("lock A", ESCROW, "lock(bytes32,uint256,uint64)", [A.hash, AMOUNT, String(unlockA)])).txHash;
  hashes.reclaimA = (await callAddr("reclaim A", ESCROW, "reclaim(uint256)", ["0"])).txHash;

  // Deposit B: lock with a short unlock, wait past it, then withdraw.
  const tokenB = randomBytes(32).toString("base64url");
  const B = recipientOf(tokenB);
  const unlockB = Math.floor(Date.now() / 1000) + 30;
  console.log("\nB. lock (id 1), short unlock, wait, then withdraw after unlock");
  hashes.lockB = (await callAddr("lock B", ESCROW, "lock(bytes32,uint256,uint64)", [B.hash, AMOUNT, String(unlockB)])).txHash;

  const waitMs = (unlockB - Math.floor(Date.now() / 1000) + 3) * 1000;
  if (waitMs > 0) {
    console.log(`  waiting ${Math.ceil(waitMs / 1000)}s for unlock ...`);
    await sleep(waitMs);
  }
  // Withdraw to the treasury address to recycle the test funds. In the app the
  // destination is the recipient's freshly created wallet.
  hashes.withdrawB = (await callAddr("withdraw B", ESCROW, "withdraw(uint256,bytes,address)", ["1", B.preimage, treasuryAddress])).txHash;

  writeFileSync(join(here, "verification.json"), JSON.stringify({ escrow: ESCROW, deployTx: dep.deployTxHash, ...hashes }, null, 2));
  console.log("\nALL DONE");
  console.log(JSON.stringify({ escrow: ESCROW, deployTx: dep.deployTxHash, ...hashes }, null, 2));
}

main().catch((e) => {
  console.error(e?.response?.data ? JSON.stringify(e.response.data) : e);
  process.exit(1);
});
