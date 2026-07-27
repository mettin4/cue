import "server-only";

import { timingSafeEqual } from "crypto";

import { cueApiSecret } from "../config";

/**
 * Thrown when the shared secret is missing or wrong. Handled as a bare 401 with
 * no detail, so it gives nothing away.
 */
export class ForbiddenError extends Error {
  constructor(message = "Not authorized.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Thrown when a caller exceeds the rate limit. Handled as 429.
 */
export class RateLimitError extends Error {
  constructor(message = "Too many requests. Slow down and try again shortly.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Rejects the request unless it carries the shared secret. Uses a constant time
 * compare so a wrong secret cannot be guessed by timing.
 */
export function requireApiSecret(request: Request): void {
  const provided = request.headers.get("x-cue-secret") ?? "";
  const expected = cueApiSecret();

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ForbiddenError();
  }
}

/**
 * A small fixed window rate limiter kept in process memory. Good enough for a
 * single instance demo. It resets on redeploy and does not coordinate across
 * instances, so it is a speed bump rather than a hard guarantee. A shared store
 * replaces it when this needs to hold across instances.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000,
): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (bucket.count >= limit) {
    throw new RateLimitError();
  }

  bucket.count += 1;

  // Opportunistic cleanup so the map does not grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAt) buckets.delete(k);
    }
  }
}

/**
 * Best effort client IP from the proxy headers Vercel sets. Falls back to a
 * shared bucket when no IP is present, which only makes the limit stricter.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
