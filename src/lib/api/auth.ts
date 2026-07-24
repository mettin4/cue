import "server-only";

import { UnauthorizedError } from "./http";

export type ActingUser = { id: string };

/**
 * Resolves who is making the request.
 *
 * Phase 5 replaces the body and header fallbacks with a real session lookup.
 * Route handlers already call this instead of trusting the request body
 * directly, so that change stays contained to this function.
 */
export async function resolveActingUser(
  request: Request,
  fallbackUserId?: string,
): Promise<ActingUser> {
  const headerUserId = request.headers.get("x-cue-user-id")?.trim();
  const userId = headerUserId || fallbackUserId?.trim();

  if (!userId) {
    throw new UnauthorizedError(
      "No user identified. Send x-cue-user-id until sign in ships.",
    );
  }

  return { id: userId };
}
