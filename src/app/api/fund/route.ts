import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { addTestFunds } from "@/lib/cue/fund";

/**
 * Grants a fixed amount of test funds to the acting account from the demo pool.
 * No body: the amount and every cap live in addTestFunds. Same secret and token
 * auth as the other write routes.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`fund:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const result = await addTestFunds(actor);

    return jsonOk({
      transactionId: result.transactionId,
      amount: result.amount,
    });
  });
}
