import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { getDashboardData } from "@/lib/cue/dashboard";

/**
 * Balance and totals for the acting account. Protected by the shared secret.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    rateLimit(`account:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const data = await getDashboardData(actor);

    return jsonOk({
      balance: data.balance,
      totalSent: data.stats.totalSent,
      totalReceived: data.stats.totalReceived,
      pendingCount: data.stats.pendingCount,
    });
  });
}
