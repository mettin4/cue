import { CueClient } from "./client.js";

/**
 * Reads configuration from the environment the user sets in their Claude
 * Desktop config. CUE_API_KEY is the shared secret for now, and CUE_USER is the
 * email the server acts as until real sign in ships.
 */
export function clientFromEnv(): CueClient {
  const baseUrl = process.env.CUE_API_URL;
  const secret = process.env.CUE_API_KEY;
  const user = process.env.CUE_USER;

  const missing = [
    ["CUE_API_URL", baseUrl],
    ["CUE_API_KEY", secret],
    ["CUE_USER", user],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing environment: ${missing.join(", ")}. Set these in your Claude Desktop config.`,
    );
  }

  return new CueClient(baseUrl!.replace(/\/+$/, ""), secret!, user!);
}
