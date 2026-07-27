/**
 * HTTP smoke test for the hardened send endpoint.
 *
 * Sends a request to POST /api/send with the shared secret header, so it
 * exercises the real boundary (secret, rate limit, validation) unlike the
 * lib level scripts. The other test scripts call the cue library directly and
 * sit below this boundary, so they do not carry the secret.
 *
 * Run with:
 *   npx tsx scripts/test-api-send.ts <baseUrl> <senderUserId> <recipientEmail>
 *
 * Reads CUE_API_SECRET from .env.local. baseUrl defaults to NEXT_PUBLIC_APP_URL.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const baseUrl =
    process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const senderUserId = process.argv[3];
  const recipientEmail = process.argv[4];
  const secret = process.env.CUE_API_SECRET;

  if (!senderUserId || !recipientEmail) {
    console.error(
      "Usage: npx tsx scripts/test-api-send.ts <baseUrl> <senderUserId> <recipientEmail>",
    );
    process.exit(1);
  }
  if (!secret) {
    console.error("CUE_API_SECRET is not set in .env.local.");
    process.exit(1);
  }

  // First, confirm the endpoint rejects a request with no secret.
  const noSecret = await fetch(`${baseUrl}/api/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ senderUserId, recipientEmail, amountUsdc: "1.00" }),
  });
  console.log(`no secret: HTTP ${noSecret.status} (expected 401)`);

  // Then the real request with the secret.
  const withSecret = await fetch(`${baseUrl}/api/send`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cue-secret": secret },
    body: JSON.stringify({ senderUserId, recipientEmail, amountUsdc: "1.00" }),
  });
  const payload = await withSecret.json();
  console.log(`with secret: HTTP ${withSecret.status}`);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
