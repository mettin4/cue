import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

import { sessionSecret } from "../config";

/**
 * Scoped sessions.
 *
 * When someone collects money they prove they can read the inbox the claim link
 * was sent to, so we mint a session on the spot with no extra step. That session
 * is deliberately limited: it can view the dashboard, balance and activity, but
 * it cannot move money, see or create a connect link, change limits, or manage
 * schedules or debts. Any of those needs a full sign in, which is the moment the
 * person becomes a real account holder.
 *
 * A full Supabase session always outranks a scoped one, so signing in upgrades
 * the same person to full power without losing anything.
 */

const COOKIE = "cue_scoped";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type ScopedPayload = { userId: string; exp: number };

function sign(body: string): string {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

function encode(payload: ScopedPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): ScopedPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ScopedPayload;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Sets the scoped session cookie. Callable from route handlers and server
 * actions, where writing cookies is allowed.
 */
export async function setScopedSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, encode({ userId, exp: Date.now() + TTL_MS }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

export async function readScopedSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE)?.value;
  if (!raw) return null;
  const payload = decode(raw);
  return payload?.userId ?? null;
}

export async function clearScopedSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
