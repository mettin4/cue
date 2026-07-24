import "server-only";

import { randomUUID } from "crypto";

import { ARC_TESTNET, getCircleClient } from "./client";

/**
 * Circle wallet operations for Cue, all scoped to Arc Testnet.
 *
 * Account type note: wallets are created as EOA. Circle recommends EOA as the
 * default (no creation fee, broadest chain support), and on Arc the gas asset
 * is USDC itself, so a wallet funded with USDC can already pay for its own
 * transfers. SCA would additionally require Gas Station configuration.
 */

const USDC_SYMBOL = "USDC";

export type CueWallet = {
  id: string;
  address: string;
  blockchain: string;
  refId?: string;
};

/**
 * Turns an unknown thrown value into an actionable message. The Circle SDK
 * wraps API failures in axios errors, where the useful detail sits in
 * response.data rather than in error.message.
 */
function describeCircleError(error: unknown, operation: string): Error {
  const parts: string[] = [`Circle ${operation} failed`];

  const err = error as {
    message?: string;
    response?: { status?: number; data?: unknown };
  };

  if (err?.response?.status) {
    parts.push(`HTTP ${err.response.status}`);
  }

  const data = err?.response?.data as
    | { code?: number; message?: string; errors?: unknown[] }
    | undefined;

  if (data?.message) {
    parts.push(data.message);
  } else if (err?.message) {
    parts.push(err.message);
  }

  if (data?.code) {
    parts.push(`(Circle code ${data.code})`);
  }

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    parts.push(`details: ${JSON.stringify(data.errors)}`);
  }

  const wrapped = new Error(parts.join(": "));
  if (error instanceof Error) {
    wrapped.cause = error;
  }
  return wrapped;
}

/**
 * Creates a wallet set. A wallet set groups wallets under one entity secret.
 * Create it once and reuse the id, do not create a new set per user.
 */
export async function createWalletSet(name: string): Promise<{
  id: string;
  name: string;
}> {
  if (!name.trim()) {
    throw new Error("createWalletSet requires a non empty name.");
  }

  try {
    const response = await getCircleClient().createWalletSet({
      name,
      idempotencyKey: randomUUID(),
    });

    const walletSet = response.data?.walletSet;
    if (!walletSet?.id) {
      throw new Error(
        "Circle returned no wallet set id. Check the API key has developer controlled wallet access.",
      );
    }

    // Circle returns only id and timestamps on WalletSet, so echo back the
    // name that was requested.
    return { id: walletSet.id, name };
  } catch (error) {
    throw describeCircleError(error, "createWalletSet");
  }
}

/**
 * Creates a single Arc Testnet wallet inside an existing wallet set.
 * refId is stored on the wallet so it can be traced back to a Cue user.
 */
export async function createWallet(
  walletSetId: string,
  refId: string,
): Promise<CueWallet> {
  if (!walletSetId) {
    throw new Error("createWallet requires a walletSetId.");
  }

  try {
    const response = await getCircleClient().createWallets({
      walletSetId,
      blockchains: [ARC_TESTNET],
      accountType: "EOA",
      count: 1,
      metadata: [{ refId }],
      idempotencyKey: randomUUID(),
    });

    const wallet = response.data?.wallets?.[0];
    if (!wallet?.id || !wallet?.address) {
      throw new Error(
        `Circle created no wallet for walletSetId ${walletSetId}. Verify the wallet set exists and Arc Testnet is enabled for this account.`,
      );
    }

    return {
      id: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain ?? ARC_TESTNET,
      refId: wallet.refId,
    };
  } catch (error) {
    throw describeCircleError(error, "createWallet");
  }
}

/**
 * Returns the USDC balance of a wallet as a decimal string, for example
 * "12.500000". Returns "0" when the wallet holds no USDC yet.
 *
 * Uses getWalletTokenBalance. getWallet never returns balance data.
 */
export async function getWalletBalance(walletId: string): Promise<{
  amount: string;
  tokenId?: string;
}> {
  if (!walletId) {
    throw new Error("getWalletBalance requires a walletId.");
  }

  try {
    const response = await getCircleClient().getWalletTokenBalance({
      id: walletId,
    });

    const balances = response.data?.tokenBalances ?? [];
    const usdc = balances.find(
      (entry) => entry.token?.symbol?.toUpperCase() === USDC_SYMBOL,
    );

    // A wallet with no USDC yet simply has no matching balance row.
    if (!usdc) {
      return { amount: "0" };
    }

    return { amount: usdc.amount ?? "0", tokenId: usdc.token?.id };
  } catch (error) {
    throw describeCircleError(error, "getWalletBalance");
  }
}

/**
 * Transfers USDC from a Cue wallet to any Arc Testnet address.
 *
 * Returns the Circle transaction id. The transfer is asynchronous: poll
 * getTransaction until it reaches COMPLETE, FAILED, DENIED or CANCELLED.
 */
export async function transferUsdc(
  fromWalletId: string,
  toAddress: string,
  amountUsdc: string,
): Promise<{ transactionId: string }> {
  if (!fromWalletId) {
    throw new Error("transferUsdc requires a fromWalletId.");
  }
  if (!toAddress) {
    throw new Error("transferUsdc requires a destination address.");
  }

  const parsed = Number(amountUsdc);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `transferUsdc got an invalid amount "${amountUsdc}". Pass a positive decimal string such as "1.50".`,
    );
  }

  // Resolve the USDC token id from the sender balance. On Arc, USDC is the gas
  // asset and has no ERC20 contract address, so tokenId is the reliable handle.
  const { amount: balance, tokenId } = await getWalletBalance(fromWalletId);

  if (!tokenId) {
    throw new Error(
      `Wallet ${fromWalletId} holds no USDC, so there is nothing to transfer. Fund it from the Circle Arc Testnet faucet first.`,
    );
  }

  if (Number(balance) < parsed) {
    throw new Error(
      `Insufficient USDC in wallet ${fromWalletId}. Balance is ${balance}, tried to send ${amountUsdc}. Note that gas on Arc is also paid in USDC.`,
    );
  }

  try {
    const response = await getCircleClient().createTransaction({
      walletId: fromWalletId,
      tokenId,
      destinationAddress: toAddress,
      amount: [amountUsdc],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    });

    const transactionId = response.data?.id;
    if (!transactionId) {
      throw new Error(
        "Circle accepted the transfer but returned no transaction id.",
      );
    }

    return { transactionId };
  } catch (error) {
    throw describeCircleError(error, "transferUsdc");
  }
}

/**
 * States a transaction can no longer move out of.
 */
export const TERMINAL_STATES = [
  "COMPLETE",
  "FAILED",
  "DENIED",
  "CANCELLED",
] as const;

export type CueTransaction = {
  id: string;
  state: string;
  txHash?: string;
  networkFee?: string;
  errorReason?: string;
  errorDetails?: string;
};

/**
 * Reads the current state of a Circle transaction.
 */
export async function getTransaction(
  transactionId: string,
): Promise<CueTransaction> {
  if (!transactionId) {
    throw new Error("getTransaction requires a transactionId.");
  }

  try {
    const response = await getCircleClient().getTransaction({
      id: transactionId,
    });

    const tx = response.data?.transaction;
    if (!tx?.id) {
      throw new Error(`Circle returned no transaction for id ${transactionId}.`);
    }

    return {
      id: tx.id,
      state: tx.state ?? "UNKNOWN",
      txHash: tx.txHash,
      networkFee: tx.networkFee,
      errorReason: tx.errorReason,
      errorDetails: tx.errorDetails,
    };
  } catch (error) {
    throw describeCircleError(error, "getTransaction");
  }
}

/**
 * Polls a transaction until it reaches a terminal state.
 *
 * Throws on timeout rather than returning a half finished transaction, so
 * callers cannot mistake "still pending" for "settled". A STUCK transaction is
 * reported through onState but does not stop the poll, since it can still be
 * accelerated or cancelled.
 */
export async function waitForTransaction(
  transactionId: string,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    onState?: (tx: CueTransaction) => void;
  } = {},
): Promise<CueTransaction> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const startedAt = Date.now();

  let last: CueTransaction | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const tx = await getTransaction(transactionId);

    if (tx.state !== last?.state) {
      options.onState?.(tx);
    }
    last = tx;

    if ((TERMINAL_STATES as readonly string[]).includes(tx.state)) {
      return tx;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Transaction ${transactionId} did not reach a terminal state within ${
      timeoutMs / 1000
    }s. Last state was ${last?.state ?? "unknown"}. It may still settle later, check with getTransaction.`,
  );
}
