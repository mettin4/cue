import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ForbiddenError, RateLimitError } from "./guard";

/**
 * Thrown when a caller is not allowed to perform an action. Phase 5 will raise
 * this from real session checks.
 */
export class UnauthorizedError extends Error {
  constructor(message = "You need to be signed in to do that.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * Wraps a route handler so every failure leaves through one place.
 *
 * Business rule failures in the cue layer are written to be shown to users, so
 * they are returned as 400. Anything unrecognised is logged and reported
 * generically rather than leaking internals to the client.
 */
export async function handleRoute(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const path = first?.path.join(".");
      return jsonError(
        path ? `${path}: ${first.message}` : (first?.message ?? "Invalid request."),
        422,
      );
    }

    if (error instanceof ForbiddenError) {
      // Bare 401, no detail, so it reveals nothing about why.
      return jsonError("Not authorized.", 401);
    }

    if (error instanceof RateLimitError) {
      return jsonError(error.message, 429);
    }

    if (error instanceof UnauthorizedError) {
      return jsonError(error.message, 401);
    }

    if (error instanceof Error) {
      return jsonError(error.message, 400);
    }

    console.error("Unhandled route error", error);
    return jsonError("Something went wrong.", 500);
  }
}
