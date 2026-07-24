import "server-only";

import { Resend } from "resend";

import { EMAIL_FROM, resendApiKey } from "../config";
import { getSupabaseAdmin } from "../supabase/server";
import type { EmailType } from "../cue/types";

let cached: Resend | null = null;

function getResend(): Resend {
  if (!cached) {
    cached = new Resend(resendApiKey());
  }
  return cached;
}

export type EmailResult = {
  ok: boolean;
  resendId?: string;
  error?: string;
};

/**
 * Sends one email and records it in email_logs.
 *
 * This never throws. Email is a notification channel, not the source of truth,
 * so a bounced message must not roll back money that already moved. Callers get
 * the outcome back and decide how loudly to surface it.
 */
export async function sendAndLog(params: {
  to: string;
  subject: string;
  html: string;
  type: EmailType;
  transactionId: string | null;
}): Promise<EmailResult> {
  let resendId: string | undefined;
  let errorMessage: string | undefined;

  try {
    const { data, error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      // Resend reports delivery problems in the body rather than by throwing.
      errorMessage = `${error.name ?? "resend_error"}: ${error.message}`;
    } else {
      resendId = data?.id;
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  // Log the attempt either way, so a missing email can be traced later.
  try {
    await getSupabaseAdmin().from("email_logs").insert({
      transaction_id: params.transactionId,
      type: params.type,
      resend_id: resendId ?? null,
    });
  } catch {
    // A logging failure must not mask the email outcome.
  }

  return errorMessage
    ? { ok: false, error: errorMessage }
    : { ok: true, resendId };
}
