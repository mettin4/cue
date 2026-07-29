import { z } from "zod";

import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonError, jsonOk } from "@/lib/api/http";
import { settleBySend, settleDebt } from "@/lib/cue/debts";
import { toAmountString } from "@/lib/cue/money";

const bodySchema = z.object({
  debtId: z.string().uuid(),
  pay: z.boolean().optional(),
});

/**
 * Settles a debt. Secret authed. With pay true, a debt you owe is settled by
 * sending the money through the normal send path; the confirmation for that
 * lives in the caller.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`debts-settle:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const body = bodySchema.parse(await request.json());

    if (body.pay) {
      const done = await settleBySend(actor, body.debtId);
      return jsonOk({ status: "paid", amount: done.amount, label: done.label });
    }

    const row = await settleDebt(actor.id, body.debtId);
    if (!row) return jsonError("No open debt found with that reference for this account.", 404);
    return jsonOk({ status: "settled", amount: toAmountString(row.amount) });
  });
}
