import { z } from "zod";

import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { createRequest } from "@/lib/cue/requests";

const bodySchema = z.object({
  requesterUserId: z.string().uuid().optional(),
  targetEmail: z.string().email(),
  amount: z.union([z.string(), z.number()]),
});

/**
 * Creates a money request and emails the target a link to pay it. Secret
 * authed, so the local package and any server side caller can reach it.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`request:${clientIp(request)}`);
    requireApiSecret(request);

    const body = bodySchema.parse(await request.json());
    const actor = await resolveActingAccount(request);

    const result = await createRequest({
      requesterUserId: actor.id,
      targetEmail: body.targetEmail,
      amount: body.amount,
    });

    return jsonOk({
      requestId: result.requestId,
      amount: result.amount,
      payUrl: result.payUrl,
      emailSent: result.email.ok,
      emailError: result.email.error,
    });
  });
}
