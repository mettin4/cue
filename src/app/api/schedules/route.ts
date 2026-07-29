import { z } from "zod";

import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { maskEmail, toAmountString } from "@/lib/cue/money";
import { createSchedule, listSchedules, nextRunDate } from "@/lib/cue/schedules";

/**
 * Lists the acting account's recurring payments. Secret authed.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    rateLimit(`schedules:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const schedules = await listSchedules(actor.id);

    return jsonOk({
      items: schedules.map((s) => ({
        id: s.id,
        amount: toAmountString(s.amount_usdc),
        recipientMasked: maskEmail(s.recipient_email),
        dayOfMonth: s.day_of_month,
        active: s.active,
        nextRun: s.active ? nextRunDate(s.day_of_month, s.last_run_at).toISOString() : null,
      })),
    });
  });
}

const bodySchema = z.object({
  senderUserId: z.string().uuid().optional(),
  recipientEmail: z.string().email(),
  amount: z.union([z.string(), z.number()]),
  dayOfMonth: z.number().int().min(1).max(28),
});

/**
 * Creates a recurring monthly payment. Secret authed.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`schedules:${clientIp(request)}`);
    requireApiSecret(request);

    const body = bodySchema.parse(await request.json());
    const actor = await resolveActingAccount(request, body.senderUserId);

    const result = await createSchedule({
      senderUserId: actor.id,
      recipientEmail: body.recipientEmail,
      amount: body.amount,
      dayOfMonth: body.dayOfMonth,
    });

    return jsonOk({
      id: result.id,
      amount: result.amount,
      dayOfMonth: result.dayOfMonth,
      firstRun: result.firstRun.toISOString(),
    });
  });
}
