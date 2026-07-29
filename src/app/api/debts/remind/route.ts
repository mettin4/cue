import { z } from "zod";

import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { sendDebtReminder } from "@/lib/cue/debts";

const bodySchema = z.object({ debtId: z.string().uuid() });

/**
 * Emails a friendly reminder for a debt owed to the acting account. Secret
 * authed. The one per day rule and all checks live in sendDebtReminder.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`debts-remind:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const body = bodySchema.parse(await request.json());

    const { label, amount } = await sendDebtReminder(actor, body.debtId);
    return jsonOk({ status: "reminded", label, amount });
  });
}
