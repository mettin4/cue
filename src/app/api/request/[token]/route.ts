import { clientIp, rateLimit } from "@/lib/api/guard";
import { handleRoute, jsonError, jsonOk } from "@/lib/api/http";
import { getRequestInfo } from "@/lib/cue/requests";

/**
 * Public read only view of a request, for the pay page. Authorised by the pay
 * token in the path, so no secret is needed. Rate limited per IP.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return handleRoute(async () => {
    rateLimit(`pay-info:${clientIp(request)}`, 60, 60_000);

    const { token } = await params;
    const info = await getRequestInfo(token);
    if (!info) {
      return jsonError("This payment link is not valid.", 404);
    }

    return jsonOk(info);
  });
}
