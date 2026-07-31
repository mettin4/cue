import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

import { cueApiSecret } from "../config";
import { getSupabaseAdmin } from "../supabase/server";

/**
 * Signed confirmation tokens for the two call flows.
 *
 * A remote server on serverless has no shared memory between the preview call
 * and the confirm call, so the pending action cannot live in process. Instead
 * the preview returns a token that carries the action, signed with the server
 * secret and bound to the account. The confirm call verifies the signature, so
 * the token cannot be forged or reused against another account.
 *
 * Each token also carries a random jti, and confirming claims that jti in the
 * database in one atomic step, so a token is single use: a replayed confirm, a
 * double clicked Approve button, or the same card rendered twice can never run
 * the action twice.
 */

const TTL_MS = 10 * 60 * 1000;

type ConfirmVariant =
  | { kind: "send"; userId: string; recipientEmail: string; amount: string }
  | { kind: "cancel"; userId: string; transactionId: string; amount: string; recipient: string }
  | { kind: "request"; userId: string; targetEmail: string; amount: string }
  | { kind: "split"; userId: string; items: { email: string; amount: string }[] }
  | { kind: "schedule"; userId: string; recipientEmail: string; amount: string; dayOfMonth: number }
  | { kind: "schedule_delete"; userId: string; scheduleId: string; amount: string; recipient: string }
  | {
      kind: "set_limit";
      userId: string;
      daily: number | null | undefined;
      monthly: number | null | undefined;
    }
  | { kind: "settle_send"; userId: string; debtId: string; recipientEmail: string; amount: string };

export type ConfirmPayload = ConfirmVariant & { exp: number; jti: string };

type Issue<K extends ConfirmVariant["kind"]> = Omit<
  Extract<ConfirmPayload, { kind: K }>,
  "exp" | "jti"
>;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(body: string): string {
  return createHmac("sha256", cueApiSecret()).update(body).digest("base64url");
}

export function issueConfirmation(payload: Issue<"send">): string;
export function issueConfirmation(payload: Issue<"cancel">): string;
export function issueConfirmation(payload: Issue<"request">): string;
export function issueConfirmation(payload: Issue<"split">): string;
export function issueConfirmation(payload: Issue<"schedule">): string;
export function issueConfirmation(payload: Issue<"schedule_delete">): string;
export function issueConfirmation(payload: Issue<"set_limit">): string;
export function issueConfirmation(payload: Issue<"settle_send">): string;
export function issueConfirmation(payload: Omit<ConfirmPayload, "exp" | "jti">): string {
  const full = {
    ...payload,
    exp: Date.now() + TTL_MS,
    jti: randomBytes(12).toString("base64url"),
  } as ConfirmPayload;
  const body = b64url(JSON.stringify(full));
  return `${body}.${sign(body)}`;
}

/**
 * Atomically claims a token's jti. Returns true only the first time, so the
 * caller runs the action once and rejects every later attempt with the same
 * token. On conflict the insert is ignored and no row comes back.
 */
export async function claimConfirmation(jti: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("used_confirmations")
    .upsert({ jti }, { onConflict: "jti", ignoreDuplicates: true })
    .select("jti");
  return (data?.length ?? 0) > 0;
}

/**
 * Verifies a confirmation token and returns its payload, or null if the
 * signature is wrong, the format is bad, or it has expired.
 */
export function readConfirmation(token: string): ConfirmPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(body);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: ConfirmPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
  return payload;
}
