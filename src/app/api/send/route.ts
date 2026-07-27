import { z } from "zod";

import { resolveActingUser } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { createSend } from "@/lib/cue/send";

const bodySchema = z.object({
  senderUserId: z.string().uuid().optional(),
  recipientEmail: z.string().email(),
  amountUsdc: z.union([z.string(), z.number()]),
  cancelWindowSeconds: z.number().int().positive().max(604800).optional(),
});

export async function POST(request: Request) {
  return handleRoute(async () => {
    // Throttle first, so failed secret attempts are also rate limited.
    rateLimit(`send:${clientIp(request)}`);
    requireApiSecret(request);

    const body = bodySchema.parse(await request.json());
    const actor = await resolveActingUser(request, body.senderUserId);

    const result = await createSend({
      senderUserId: actor.id,
      recipientEmail: body.recipientEmail,
      amountUsdc: body.amountUsdc,
      cancelWindowSeconds: body.cancelWindowSeconds,
    });

    return jsonOk({
      transactionId: result.transactionId,
      amount: result.amount,
      cancelDeadline: result.cancelDeadline.toISOString(),
      emailSent: result.email.ok,
      emailError: result.email.error,
    });
  });
}
