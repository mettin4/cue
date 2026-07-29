import "server-only";

import { resolveConnectToken } from "../mcp/tokens";
import type { UserRow } from "../cue/types";
import { UnauthorizedError } from "./http";

/**
 * Resolves who is making a request to the secret authed API routes, which today
 * only the local development package calls.
 *
 * Identity comes from a connect token in the x-cue-token header, the same
 * per user token the remote MCP endpoint uses. There is no trusted email header
 * any more: a caller proves who they are by holding a token that only the signed
 * in owner could have created. The shared secret still gates these routes, but
 * it is layered under this token identity rather than being identity itself.
 */
export async function resolveActingAccount(request: Request): Promise<UserRow> {
  const token = request.headers.get("x-cue-token")?.trim();
  if (!token) {
    throw new UnauthorizedError(
      "No connect token provided. Create a connect link on the dashboard and send its token in the x-cue-token header.",
    );
  }

  const user = await resolveConnectToken(token);
  if (!user) {
    throw new UnauthorizedError("That connect token is not valid or has been revoked. Create a fresh one on the dashboard.");
  }

  return user;
}
