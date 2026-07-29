import { z } from "zod";

import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { cancelRequest } from "@/lib/cue/requests";

const bodySchema = z.object({
  requesterUserId: z.string().uuid().optional(),
  requestId: z.string().uuid(),
});

/**
 * Cancels a pending money request. Secret authed. Only the account that created
 * the request can cancel it, enforced in the cue layer.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`request-cancel:${clientIp(request)}`);
    requireApiSecret(request);

    const body = bodySchema.parse(await request.json());
    const actor = await resolveActingAccount(request);

    const result = await cancelRequest({
      requestId: body.requestId,
      requesterUserId: actor.id,
    });

    return jsonOk({ amount: result.amount, target: result.targetLabel, status: "cancelled" });
  });
}
