import "server-only";

import { appUrl, brandMarkUrl } from "../config";
import { normaliseEmail } from "../cue/money";
import { magicLinkEmail } from "../email/templates";
import { sendAndLog } from "../email/send";
import { getSupabaseAdmin } from "../supabase/server";

/**
 * The one place a magic link is sent.
 *
 * We generate the link ourselves and deliver it through Resend with our own
 * branded template, so Supabase never sends anything. Our domain is verified, so
 * this reaches any address. Generating the link ourselves also sidesteps two
 * traps in the default Supabase email path: the wrong template firing for new
 * versus returning users, and the PKCE code redirect that our confirm route
 * cannot use. Our link always carries a token_hash, which verifyOtp reads
 * directly, works cross device, and needs no template configuration.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const clean = normaliseEmail(email);
  if (!clean.includes("@")) {
    throw new Error(`"${email}" does not look like a valid email address. Check it and try again.`);
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: clean });

    const hashed = data?.properties?.hashed_token;
    const type = data?.properties?.verification_type;
    if (error || !hashed || !type) throw new Error(error?.message ?? "Could not prepare a link.");

    const signInUrl = `${appUrl()}/auth/confirm?token_hash=${encodeURIComponent(
      hashed,
    )}&type=${encodeURIComponent(type)}`;

    const { subject, html } = magicLinkEmail({ signInUrl, markUrl: brandMarkUrl() });
    const result = await sendAndLog({ to: clean, subject, html, type: "sign_in", transactionId: null });
    if (!result.ok) throw new Error(result.error ?? "send failed");
  } catch {
    throw new Error("We could not send the sign in email just now. Wait a moment and try again.");
  }
}
