import "server-only";

import { randomUUID } from "crypto";
import { keccak256 } from "js-sha3";

import { arcRpcUrl } from "../config";
import { getCircleClient } from "./client";

/**
 * Contract calls for Cue, layered on the same developer-controlled wallets
 * client used for transfers. Writes go through createContractExecutionTransaction
 * (Circle encodes the call from the ABI signature and parameters); the returned
 * transaction is polled to a terminal state exactly like a transfer. Reads of a
 * transaction receipt use the public Arc RPC directly, only to recover an event
 * value that the wallets API does not surface.
 */

export type ExecResult = { transactionId: string };

/**
 * Executes a write method on a contract from a developer-controlled wallet, which
 * pays the USDC gas. Returns the Circle transaction id to poll with
 * waitForTransaction.
 */
export async function executeContract(params: {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: unknown[];
}): Promise<ExecResult> {
  const response = await getCircleClient().createContractExecutionTransaction({
    walletId: params.walletId,
    contractAddress: params.contractAddress,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters: params.abiParameters as (string | number | boolean)[],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });

  const transactionId = response.data?.id;
  if (!transactionId) {
    throw new Error("Circle accepted the contract call but returned no transaction id.");
  }
  return { transactionId };
}

// keccak256 of the Locked event signature, its topic0.
const LOCKED_TOPIC =
  "0x" + keccak256("Locked(uint256,address,bytes32,uint256,uint64)");

async function rpc(method: string, params: unknown[]): Promise<{ logs?: { address?: string; topics?: string[] }[] } | null> {
  const res = await fetch(arcRpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(`Arc RPC ${method}: ${json.error.message ?? "error"}`);
  return (json.result as { logs?: { address?: string; topics?: string[] }[] }) ?? null;
}

/**
 * Reads the deposit id assigned by CueEscrow.lock from its transaction receipt.
 * The id is the first indexed topic of the Locked event. Deriving it from the
 * receipt is race free, unlike reading nextId before the call.
 */
export async function readLockedId(txHash: string, escrowAddress: string): Promise<bigint> {
  const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
  const logs = receipt?.logs ?? [];
  const log = logs.find(
    (l) =>
      l.address?.toLowerCase() === escrowAddress.toLowerCase() &&
      l.topics?.[0]?.toLowerCase() === LOCKED_TOPIC.toLowerCase(),
  );
  if (!log || !log.topics?.[1]) {
    throw new Error("Could not find the lock event in the transaction receipt.");
  }
  return BigInt(log.topics[1]);
}
