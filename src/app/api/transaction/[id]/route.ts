import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonError, jsonOk } from "@/lib/api/http";
import { getSendStatus } from "@/lib/cue/actions";

/**
 * Status of one send owned by the acting account, for the collect status check.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    rateLimit(`transaction:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const { id } = await params;

    const summary = await getSendStatus(id, actor.id);
    if (!summary) {
      return jsonError("No send found with that reference for this account.", 404);
    }

    return jsonOk(summary);
  });
}
