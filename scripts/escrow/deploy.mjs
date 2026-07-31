/**
 * Deploys CueEscrow to Arc testnet through Circle's Smart Contract Platform,
 * from the treasury wallet (which pays the USDC gas). Prints the address and the
 * deploy transaction hash, and writes scripts/escrow/deployment.json.
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

config({ path: ".env.local" });

const here = dirname(fileURLToPath(import.meta.url));
const { abi, bytecode } = JSON.parse(readFileSync(join(here, "CueEscrow.build.json"), "utf8"));

const USDC = "0x3600000000000000000000000000000000000000";
const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
const walletId = process.env.TREASURY_WALLET_ID;

const scp = initiateSmartContractPlatformClient({ apiKey, entitySecret });
const dcw = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("deploying CueEscrow to ARC-TESTNET from treasury", walletId);
  const dep = await scp.deployContract({
    name: "CueEscrow",
    walletId,
    abiJson: JSON.stringify(abi),
    bytecode,
    blockchain: "ARC-TESTNET",
    constructorParameters: [USDC],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const contractId = dep.data?.contractId;
  const transactionId = dep.data?.transactionId;
  console.log("contractId:", contractId, "transactionId:", transactionId);

  let address, status;
  for (let i = 0; i < 80; i++) {
    const r = await scp.getContract({ id: contractId });
    const c = r.data?.contract ?? r.data;
    status = c?.status;
    address = c?.contractAddress;
    console.log(`  [${i}] status=${status} address=${address ?? "-"}`);
    if (address && status && status !== "PENDING" && status !== "QUEUED") break;
    if (status === "FAILED") {
      console.error("deploy FAILED:", c?.deploymentErrorReason, c?.deploymentErrorDetails);
      process.exit(1);
    }
    await sleep(3000);
  }

  let deployTxHash;
  for (let i = 0; i < 40; i++) {
    const t = await dcw.getTransaction({ id: transactionId });
    const tx = t.data?.transaction;
    deployTxHash = tx?.txHash;
    if (deployTxHash) break;
    await sleep(3000);
  }

  const out = { address, contractId, transactionId, deployTxHash, usdc: USDC, blockchain: "ARC-TESTNET" };
  writeFileSync(join(here, "deployment.json"), JSON.stringify(out, null, 2));
  console.log("\nDEPLOYED");
  console.log("  address:", address);
  console.log("  deploy tx:", deployTxHash);
  console.log("  explorer:", `https://testnet.arcscan.app/tx/${deployTxHash}`);
  console.log("  contract:", `https://testnet.arcscan.app/address/${address}`);
}

main().catch((e) => {
  console.error(e?.response?.data ? JSON.stringify(e.response.data) : e);
  process.exit(1);
});
