import { z } from "zod";

import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { listDebts, trackDebt } from "@/lib/cue/debts";

/**
 * Open debts for the acting account, grouped by person. Secret authed.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    rateLimit(`debts:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const people = await listDebts(actor.id);
    return jsonOk({ people });
  });
}

const bodySchema = z.object({
  counterparty: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  direction: z.enum(["they_owe", "i_owe"]),
  note: z.string().optional(),
});

/**
 * Records a debt. Secret authed.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`debts:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const body = bodySchema.parse(await request.json());

    const { debt, label } = await trackDebt({
      userId: actor.id,
      counterparty: body.counterparty,
      amount: body.amount,
      direction: body.direction,
      note: body.note,
    });

    return jsonOk({
      debtId: debt.id,
      label,
      amount: String(debt.amount),
      direction: debt.direction,
    });
  });
}
