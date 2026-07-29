import { z } from "zod";

import { clientIp, rateLimit } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { setScopedSession } from "@/lib/auth/scoped";
import { claimSend } from "@/lib/cue/claim";

const bodySchema = z.object({
  claimToken: z.string().min(20),
  recipientEmail: z.string().email(),
});

/**
 * Collecting is authorised by the claim link plus a matching email address, so
 * this route stays open once sign in ships. Rate limited per IP to blunt any
 * attempt to brute force claim tokens.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`claim:${clientIp(request)}`);

    const body = bodySchema.parse(await request.json());

    const result = await claimSend({
      claimToken: body.claimToken,
      recipientEmail: body.recipientEmail,
    });

    // Collecting proves access to the inbox the claim link was sent to, so mint a
    // scoped session on the spot. It can view the dashboard but not move money or
    // manage the account; that needs a full sign in.
    await setScopedSession(result.recipientUserId);

    return jsonOk({
      transactionId: result.transactionId,
      amount: result.amount,
      circleTxId: result.circleTxId,
      txHash: result.txHash,
      recipientUserId: result.recipientUserId,
      status: "claimed",
      emailSent: result.email.ok,
    });
  });
}
