import { z } from "zod";

import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonError, jsonOk } from "@/lib/api/http";
import { maskEmail, toAmountString } from "@/lib/cue/money";
import { deleteSchedule, setScheduleActive } from "@/lib/cue/schedules";

const bodySchema = z.object({
  senderUserId: z.string().uuid().optional(),
  scheduleId: z.string().uuid(),
  action: z.enum(["pause", "resume", "delete"]),
});

/**
 * Pauses, resumes or deletes one recurring payment. Secret authed. The delete
 * confirmation lives in the client, so this endpoint carries out the action it
 * is given.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`schedules-manage:${clientIp(request)}`);
    requireApiSecret(request);

    const body = bodySchema.parse(await request.json());
    const actor = await resolveActingAccount(request);

    if (body.action === "delete") {
      const ok = await deleteSchedule(actor.id, body.scheduleId);
      if (!ok) return jsonError("No schedule found with that reference for this account.", 404);
      return jsonOk({ status: "deleted" });
    }

    const active = body.action === "resume";
    const updated = await setScheduleActive(actor.id, body.scheduleId, active);
    if (!updated) return jsonError("No schedule found with that reference for this account.", 404);

    return jsonOk({
      status: active ? "resumed" : "paused",
      amount: toAmountString(updated.amount_usdc),
      recipient: maskEmail(updated.recipient_email),
      dayOfMonth: updated.day_of_month,
    });
  });
}
