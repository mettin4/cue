import { CueClient } from "./client.js";

/**
 * Reads configuration from the environment the user sets in their Claude Desktop
 * config. CUE_API_KEY is the shared service secret, and CUE_TOKEN is the
 * account's connect token, created on the dashboard after signing in. The token
 * is the identity: it maps every call to the signed in owner's account.
 */
export function clientFromEnv(): CueClient {
  const baseUrl = process.env.CUE_API_URL;
  const secret = process.env.CUE_API_KEY;
  const token = process.env.CUE_TOKEN;

  const missing = [
    ["CUE_API_URL", baseUrl],
    ["CUE_API_KEY", secret],
    ["CUE_TOKEN", token],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing environment: ${missing.join(", ")}. Set these in your Claude Desktop config. Create CUE_TOKEN on the dashboard after signing in.`,
    );
  }

  return new CueClient(baseUrl!.replace(/\/+$/, ""), secret!, token!);
}
