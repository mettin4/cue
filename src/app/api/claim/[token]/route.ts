import { handleRoute, jsonError, jsonOk } from "@/lib/api/http";
import { getClaimInfo } from "@/lib/cue/claim";

/**
 * Read only details for the claim page. Deliberately returns nothing that
 * identifies the sender beyond a masked address.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return handleRoute(async () => {
    const { token } = await params;

    const info = await getClaimInfo(token);
    if (!info) {
      return jsonError("This link is not valid.", 404);
    }

    return jsonOk(info);
  });
}
