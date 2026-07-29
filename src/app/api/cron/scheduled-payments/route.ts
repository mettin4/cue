import { timingSafeEqual } from "crypto";

import { cronSecret } from "@/lib/config";
import { runScheduledPayments } from "@/lib/cue/schedules";

export const dynamic = "force-dynamic";

/**
 * Daily runner for scheduled payments, triggered by Vercel Cron.
 *
 * Vercel attaches the project's CRON_SECRET as a bearer token on every cron
 * request, so checking it here means only Vercel can start the job. The runner
 * itself is idempotent for the day, so an accidental extra trigger cannot pay a
 * schedule twice.
 */
function authorized(request: Request): boolean {
  let expected: string;
  try {
    expected = cronSecret();
  } catch {
    // No secret configured means nothing may trigger this.
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  try {
    const summary = await runScheduledPayments();
    return Response.json({ ok: true, data: summary });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Run failed." },
      { status: 500 },
    );
  }
}
