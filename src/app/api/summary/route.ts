import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { getSpendingSummary, type SummaryPeriod } from "@/lib/cue/summary";

/**
 * Spending summary for the acting account over a period. Secret authed.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    rateLimit(`summary:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const url = new URL(request.url);
    const periodRaw = url.searchParams.get("period") ?? "this_month";
    const allowed: SummaryPeriod[] = ["this_week", "this_month", "last_month", "custom"];
    const period = (allowed as string[]).includes(periodRaw)
      ? (periodRaw as SummaryPeriod)
      : "this_month";

    const summary = await getSpendingSummary(actor, {
      period,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });

    return jsonOk(summary);
  });
}
