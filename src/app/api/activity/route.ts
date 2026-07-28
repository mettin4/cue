import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonError, jsonOk } from "@/lib/api/http";
import { findLatestPendingSend } from "@/lib/cue/actions";
import { getDashboardData } from "@/lib/cue/dashboard";

/**
 * Recent activity for the acting account.
 *
 *   ?direction=in|out   filter by direction
 *   ?limit=N            cap the number of rows
 *   ?recipient=email    return the latest uncollected send to that recipient,
 *                       used to cancel by recipient when no id is given
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    rateLimit(`activity:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const url = new URL(request.url);
    const recipient = url.searchParams.get("recipient");

    if (recipient) {
      const match = await findLatestPendingSend(actor.id, recipient);
      return jsonOk({ items: match ? [match] : [] });
    }

    const direction = url.searchParams.get("direction");
    if (direction && direction !== "in" && direction !== "out") {
      return jsonError("direction must be 'in' or 'out'.", 422);
    }

    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50)
      : 20;

    const data = await getDashboardData(actor);
    const items = data.activity
      .filter((item) => !direction || item.direction === direction)
      .slice(0, limit)
      .map((item) => ({
        transactionId: item.id,
        amount: item.amount,
        status: item.status,
        direction: item.direction,
        counterparty: item.counterparty,
        secondsUntilUnlock: item.secondsUntilUnlock,
        createdAt: item.createdAt,
      }));

    return jsonOk({ items });
  });
}
