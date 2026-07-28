import "server-only";

import { resolveDashboardUser } from "../cue/dashboard";
import { findOrCreateUserByEmail } from "../cue/users";
import type { UserRow } from "../cue/types";
import { UnauthorizedError } from "./http";

export type ActingUser = { id: string };

/**
 * Resolves who is making the request.
 *
 * Three inputs, in order of preference:
 *   x-cue-user       an email address (how the MCP server identifies itself)
 *   x-cue-user-id    a user id or email (used by tests and the dashboard)
 *   fallback         a value from the request body
 *
 * Phase 5 replaces all of this with a real session. Route handlers call this
 * instead of trusting the body directly, so that change stays contained here.
 */
export async function resolveActingAccount(
  request: Request,
  fallback?: string,
): Promise<UserRow> {
  const email = request.headers.get("x-cue-user")?.trim();
  if (email) {
    return findOrCreateUserByEmail(email);
  }

  const identifier =
    request.headers.get("x-cue-user-id")?.trim() || fallback?.trim();

  if (!identifier) {
    throw new UnauthorizedError(
      "No account identified. Send x-cue-user with an email until sign in ships.",
    );
  }

  const user = await resolveDashboardUser(identifier);
  if (!user) {
    throw new UnauthorizedError("No account found for the given user.");
  }
  return user;
}
