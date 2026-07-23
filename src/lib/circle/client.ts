import "server-only";

import {
  initiateDeveloperControlledWalletsClient,
  type Blockchain,
} from "@circle-fin/developer-controlled-wallets";

/**
 * Server side Circle developer controlled wallets client.
 *
 * The API key and entity secret grant full custody over every Cue wallet, so
 * this module is marked "server-only" and must never reach the browser.
 */

/**
 * Arc Testnet chain identifier, taken from the Circle SDK Blockchain enum
 * (Blockchain.ArcTestnet). Typed as Blockchain so a bad literal fails to
 * compile rather than failing at runtime against the API.
 */
export const ARC_TESTNET: Blockchain = "ARC-TESTNET";

/**
 * On Arc the gas asset is USDC itself, not a separate native token, so funding
 * a wallet with USDC also covers its gas.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local, see .env.example for the full list.`,
    );
  }
  return value;
}

type CircleClient = ReturnType<typeof initiateDeveloperControlledWalletsClient>;

let cached: CircleClient | null = null;

export function getCircleClient(): CircleClient {
  if (cached) return cached;

  const apiKey = requireEnv("CIRCLE_API_KEY");
  const entitySecret = requireEnv("CIRCLE_ENTITY_SECRET");

  cached = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
  });

  return cached;
}
