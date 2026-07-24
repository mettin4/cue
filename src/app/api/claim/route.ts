import { z } from "zod";

import { handleRoute, jsonOk } from "@/lib/api/http";
import { claimSend } from "@/lib/cue/claim";

const bodySchema = z.object({
  claimToken: z.string().min(20),
  recipientEmail: z.string().email(),
});

/**
 * Collecting is authorised by the claim link plus a matching email address, so
 * this route stays open once sign in ships.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = bodySchema.parse(await request.json());

    const result = await claimSend({
      claimToken: body.claimToken,
      recipientEmail: body.recipientEmail,
    });

    return jsonOk({
      transactionId: result.transactionId,
      amount: result.amount,
      circleTxId: result.circleTxId,
      txHash: result.txHash,
      status: "claimed",
      emailSent: result.email.ok,
    });
  });
}
