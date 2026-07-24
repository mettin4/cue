import { z } from "zod";

import { resolveActingUser } from "@/lib/api/auth";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { cancelSend } from "@/lib/cue/cancel";

const bodySchema = z.object({
  transactionId: z.string().uuid(),
  senderUserId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = bodySchema.parse(await request.json());
    const actor = await resolveActingUser(request, body.senderUserId);

    const result = await cancelSend({
      transactionId: body.transactionId,
      senderUserId: actor.id,
    });

    return jsonOk({
      transactionId: result.transactionId,
      amount: result.amount,
      status: "cancelled",
      recipientNotified: result.email?.ok ?? false,
    });
  });
}
