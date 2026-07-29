import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

import { cueApiSecret } from "../config";

/**
 * Signed confirmation tokens for the two call send and cancel flow.
 *
 * A remote server on serverless has no shared memory between the preview call
 * and the confirm call, so the pending action cannot live in process. Instead
 * the preview returns a token that carries the action, signed with the server
 * secret and bound to the account. The confirm call verifies the signature, so
 * the token cannot be forged or reused against another account.
 */

const TTL_MS = 10 * 60 * 1000;

export type ConfirmPayload =
  | { kind: "send"; userId: string; recipientEmail: string; amount: string; exp: number }
  | {
      kind: "cancel";
      userId: string;
      transactionId: string;
      amount: string;
      recipient: string;
      exp: number;
    }
  | { kind: "request"; userId: string; targetEmail: string; amount: string; exp: number }
  | {
      kind: "split";
      userId: string;
      items: { email: string; amount: string }[];
      exp: number;
    }
  | {
      kind: "schedule";
      userId: string;
      recipientEmail: string;
      amount: string;
      dayOfMonth: number;
      exp: number;
    }
  | {
      kind: "schedule_delete";
      userId: string;
      scheduleId: string;
      amount: string;
      recipient: string;
      exp: number;
    };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(body: string): string {
  return createHmac("sha256", cueApiSecret()).update(body).digest("base64url");
}

export function issueConfirmation(
  payload: Omit<Extract<ConfirmPayload, { kind: "send" }>, "exp">,
): string;
export function issueConfirmation(
  payload: Omit<Extract<ConfirmPayload, { kind: "cancel" }>, "exp">,
): string;
export function issueConfirmation(
  payload: Omit<Extract<ConfirmPayload, { kind: "request" }>, "exp">,
): string;
export function issueConfirmation(
  payload: Omit<Extract<ConfirmPayload, { kind: "split" }>, "exp">,
): string;
export function issueConfirmation(
  payload: Omit<Extract<ConfirmPayload, { kind: "schedule" }>, "exp">,
): string;
export function issueConfirmation(
  payload: Omit<Extract<ConfirmPayload, { kind: "schedule_delete" }>, "exp">,
): string;
export function issueConfirmation(payload: Omit<ConfirmPayload, "exp">): string {
  const full = { ...payload, exp: Date.now() + TTL_MS } as ConfirmPayload;
  const body = b64url(JSON.stringify(full));
  return `${body}.${sign(body)}`;
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
