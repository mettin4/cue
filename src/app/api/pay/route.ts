import { z } from "zod";

import { clientIp, rateLimit } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { payRequest } from "@/lib/cue/requests";

const bodySchema = z.object({
  payToken: z.string().min(20),
  payerEmail: z.string().email(),
});

/**
 * Pays a money request. Authorised by the pay token plus the payer's email, so
 * this stays open like the collect route. Rate limited per IP to blunt any
 * attempt to guess pay tokens.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`pay:${clientIp(request)}`);

    const body = bodySchema.parse(await request.json());

    const result = await payRequest({
      payToken: body.payToken,
      payerEmail: body.payerEmail,
    });

    return jsonOk({
      amount: result.amount,
      requester: result.requesterLabel,
      transactionId: result.transactionId,
      status: "paid",
    });
  });
}
