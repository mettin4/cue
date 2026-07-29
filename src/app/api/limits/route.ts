import { z } from "zod";

import { resolveActingAccount } from "@/lib/api/auth";
import { clientIp, rateLimit, requireApiSecret } from "@/lib/api/guard";
import { handleRoute, jsonOk } from "@/lib/api/http";
import { getLimits, getUsage, setLimits } from "@/lib/cue/limits";

/**
 * Current spending limits and how much of each is used. Secret authed.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    rateLimit(`limits:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const [limits, usage] = await Promise.all([getLimits(actor.id), getUsage(actor.id)]);
    return jsonOk({ limits, usage });
  });
}

const bodySchema = z.object({
  // null clears a limit, omitted leaves it untouched.
  daily: z.number().nonnegative().nullable().optional(),
  monthly: z.number().nonnegative().nullable().optional(),
});

/**
 * Sets or clears spending limits. Secret authed. The loosening confirmation lives
 * in the caller, so this endpoint applies what it is given.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    rateLimit(`limits:${clientIp(request)}`);
    requireApiSecret(request);

    const actor = await resolveActingAccount(request);
    const body = bodySchema.parse(await request.json());

    // Treat 0 as remove, matching the tool.
    const next = {
      daily: body.daily === undefined ? undefined : body.daily && body.daily > 0 ? body.daily : null,
      monthly: body.monthly === undefined ? undefined : body.monthly && body.monthly > 0 ? body.monthly : null,
    };

    const limits = await setLimits(actor.id, next);
    return jsonOk({ limits });
  });
}
