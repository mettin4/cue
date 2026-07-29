import "server-only";

import { randomBytes } from "crypto";

import { appUrl, brandMarkUrl, maxSendUsdc } from "../config";
import { requestMoneyEmail } from "../email/templates";
import { sendAndLog } from "../email/send";
import { getSupabaseAdmin } from "../supabase/server";
import { findOrCreateUserByEmail } from "./users";
import { maskEmail, normaliseEmail, parseAmount, toAmountString } from "./money";
import { createSend } from "./send";
import type { EmailResult } from "../email/send";
import type { RequestRow, RequestStatus, UserRow } from "./types";

const FIELDS =
  "id, requester_id, target_email, amount, status, pay_token, created_at, paid_at";

function generatePayToken(): string {
  return randomBytes(32).toString("base64url");
}

export type CreateRequestResult = {
  requestId: string;
  payToken: string;
  payUrl: string;
  amount: string;
  targetEmail: string;
  email: EmailResult;
};

/**
 * Creates a money request and emails the target a link to pay it. No money moves
 * here. Paying the request later creates an ordinary send from the payer to the
 * requester, so the request is only an invitation to pay.
 */
export async function createRequest(params: {
  requesterUserId: string;
  targetEmail: string;
  amount: string | number;
}): Promise<CreateRequestResult> {
  const supabase = getSupabaseAdmin();

  const amount = parseAmount(params.amount);
  const targetEmail = normaliseEmail(params.targetEmail);

  if (!targetEmail.includes("@")) {
    throw new Error(
      `"${params.targetEmail}" does not look like a valid email address. Check the address and try again.`,
    );
  }

  // A request can only be paid by a single send, so an amount above the send
  // limit could never be fulfilled. Reject it now with the same limit.
  const cap = maxSendUsdc();
  if (Number(amount) > cap) {
    throw new Error(
      `That is more than the current limit of ${cap.toFixed(2)} dollars per request. Try a smaller amount.`,
    );
  }

  const { data: requester, error: requesterError } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", params.requesterUserId)
    .maybeSingle<Pick<UserRow, "id" | "email">>();

  if (requesterError) {
    throw new Error(`Could not look up the account: ${requesterError.message}`);
  }
  if (!requester) {
    throw new Error(`No user found with id ${params.requesterUserId}.`);
  }

  if (normaliseEmail(requester.email) === targetEmail) {
    throw new Error(
      "Money can only be requested from someone else. Please use a different email address, not your own.",
    );
  }

  const payToken = generatePayToken();

  const { data: inserted, error: insertError } = await supabase
    .from("requests")
    .insert({
      requester_id: requester.id,
      target_email: targetEmail,
      amount,
      status: "pending",
      pay_token: payToken,
    })
    .select("id")
    .single<Pick<RequestRow, "id">>();

  if (insertError || !inserted) {
    throw new Error(
      `Could not record the request: ${insertError?.message ?? "no row returned"}`,
    );
  }

  const payUrl = `${appUrl()}/pay/${payToken}`;

  const { subject, html } = requestMoneyEmail({
    amount,
    requesterLabel: maskEmail(requester.email),
    payUrl,
    markUrl: brandMarkUrl(),
  });

  const email = await sendAndLog({
    to: targetEmail,
    subject,
    html,
    type: "money_request",
    transactionId: null,
  });

  return {
    requestId: inserted.id,
    payToken,
    payUrl,
    amount,
    targetEmail,
    email,
  };
}

export type RequestInfo = {
  amount: string;
  status: RequestStatus;
  requesterLabel: string;
};

/**
 * Read only view of a request for the public pay page. Returns null when the
 * token matches nothing.
 */
export async function getRequestInfo(payToken: string): Promise<RequestInfo | null> {
  const supabase = getSupabaseAdmin();

  const { data: request } = await supabase
    .from("requests")
    .select(FIELDS)
    .eq("pay_token", payToken)
    .maybeSingle<RequestRow>();

  if (!request) return null;

  let requesterLabel = "Someone";
  const { data: requester } = await supabase
    .from("users")
    .select("email")
    .eq("id", request.requester_id)
    .maybeSingle<Pick<UserRow, "email">>();
  if (requester?.email) requesterLabel = maskEmail(requester.email);

  return {
    amount: toAmountString(request.amount),
    status: request.status,
    requesterLabel,
  };
}

/**
 * Calls off a pending request. Only the account that created it can cancel it.
 */
export async function cancelRequest(params: {
  requestId: string;
  requesterUserId: string;
}): Promise<{ amount: string; targetLabel: string }> {
  const supabase = getSupabaseAdmin();

  const { data: request } = await supabase
    .from("requests")
    .select(FIELDS)
    .eq("id", params.requestId)
    .eq("requester_id", params.requesterUserId)
    .maybeSingle<RequestRow>();

  if (!request) {
    throw new Error("No request found with that reference for this account.");
  }
  if (request.status !== "pending") {
    if (request.status === "paid") {
      throw new Error("That request has already been paid, so it cannot be cancelled.");
    }
    throw new Error("That request is no longer active, so there is nothing to cancel.");
  }

  const { data: updated } = await supabase
    .from("requests")
    .update({ status: "cancelled" })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!updated) {
    throw new Error("That request was just paid or cancelled, so nothing changed.");
  }

  return {
    amount: toAmountString(request.amount),
    targetLabel: maskEmail(request.target_email),
  };
}

export type PayResult = {
  amount: string;
  requesterLabel: string;
  transactionId: string;
};

/**
 * Pays a pending request. The request is claimed first with a conditional
 * update, then the send is created, mirroring the collect flow so a double
 * submit cannot pay twice and a failed send does not leave the request marked
 * paid.
 */
export async function payRequest(params: {
  payToken: string;
  payerEmail: string;
}): Promise<PayResult> {
  const supabase = getSupabaseAdmin();
  const payerEmail = normaliseEmail(params.payerEmail);

  if (!payerEmail.includes("@")) {
    throw new Error(
      `"${params.payerEmail}" does not look like a valid email address. Check it and try again.`,
    );
  }

  const { data: request } = await supabase
    .from("requests")
    .select(FIELDS)
    .eq("pay_token", params.payToken)
    .maybeSingle<RequestRow>();

  if (!request) {
    throw new Error("This payment link is not valid.");
  }
  if (request.status === "paid") {
    throw new Error("This request has already been paid.");
  }
  if (request.status === "cancelled") {
    throw new Error("This request was cancelled, so there is nothing to pay.");
  }
  if (request.status !== "pending") {
    throw new Error("This request is no longer open for payment.");
  }

  const { data: requester } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", request.requester_id)
    .maybeSingle<Pick<UserRow, "id" | "email">>();

  if (!requester) {
    throw new Error("The account that asked for this could not be found.");
  }
  if (normaliseEmail(requester.email) === payerEmail) {
    throw new Error(
      "This request was created by this account, so it cannot be paid from the same address.",
    );
  }

  const amount = toAmountString(request.amount);

  // Make sure the payer has an account before claiming the request.
  const payer = await findOrCreateUserByEmail(payerEmail);

  // Claim the request. If another payment already moved it, stop here.
  const { data: claimed } = await supabase
    .from("requests")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!claimed) {
    throw new Error("This request was just paid or cancelled. Nothing was charged.");
  }

  try {
    const send = await createSend({
      senderUserId: payer.id,
      recipientEmail: requester.email,
      amountUsdc: amount,
    });
    return {
      amount,
      requesterLabel: maskEmail(requester.email),
      transactionId: send.transactionId,
    };
  } catch (error) {
    // The send never started, so put the request back so it can be paid again.
    await supabase
      .from("requests")
      .update({ status: "pending", paid_at: null })
      .eq("id", request.id)
      .eq("status", "paid");
    throw error;
  }
}

export type RequestItem = {
  id: string;
  amount: string;
  status: RequestStatus;
  direction: "in" | "out";
  counterparty: string;
  createdAt: string | null;
};

/**
 * Requests involving this account, both the ones it sent out and the ones asking
 * it to pay, newest first. Emails are always masked.
 */
export async function listRequests(
  user: UserRow,
  options: { direction?: "in" | "out"; limit?: number } = {},
): Promise<RequestItem[]> {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

  const [outgoing, incoming] = await Promise.all([
    options.direction === "in"
      ? Promise.resolve({ data: [] as RequestRow[] })
      : supabase
          .from("requests")
          .select(FIELDS)
          .eq("requester_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit),
    options.direction === "out"
      ? Promise.resolve({ data: [] as RequestRow[] })
      : supabase
          .from("requests")
          .select(FIELDS)
          .eq("target_email", normaliseEmail(user.email))
          .order("created_at", { ascending: false })
          .limit(limit),
  ]);

  const out = ((outgoing.data ?? []) as RequestRow[]).map((row) => ({
    id: row.id,
    amount: toAmountString(row.amount),
    status: row.status,
    direction: "out" as const,
    counterparty: maskEmail(row.target_email),
    createdAt: row.created_at,
  }));

  // Name the requester on incoming requests without exposing a full address.
  const incomingRows = (incoming.data ?? []) as RequestRow[];
  const requesterIds = [...new Set(incomingRows.map((r) => r.requester_id))];
  const requesterEmails = new Map<string, string>();
  if (requesterIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email")
      .in("id", requesterIds);
    for (const u of users ?? []) requesterEmails.set(u.id, u.email);
  }

  const inc = incomingRows.map((row) => ({
    id: row.id,
    amount: toAmountString(row.amount),
    status: row.status,
    direction: "in" as const,
    counterparty: maskEmail(requesterEmails.get(row.requester_id) ?? "someone@unknown"),
    createdAt: row.created_at,
  }));

  return [...out, ...inc]
    .sort((a, b) => {
      const left = a.createdAt ? Date.parse(a.createdAt) : 0;
      const right = b.createdAt ? Date.parse(b.createdAt) : 0;
      return right - left;
    })
    .slice(0, limit);
}
