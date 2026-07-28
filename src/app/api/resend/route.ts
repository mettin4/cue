import { z } from "zod";

import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { resendClaimEmail } from "@/lib/cue/actions";

const bodySchema = z.object({
  transactionId: z.string().uuid(),
});

/**
 * Sends the collection email again for a pending send owned by the account.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`resend:${clientIp(request)}`);
    requireApiSecret(request);

    const body = bodySchema.parse(await request.json());
    const actor = await resolveActingAccount(request);

    const result = await resendClaimEmail(body.transactionId, actor);

    return jsonOk({
      transactionId: body.transactionId,
      recipient: result.recipient,
      emailSent: result.ok,
      emailError: result.error,
    });
  });
}
