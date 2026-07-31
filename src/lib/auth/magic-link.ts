import "server-only";

import { appUrl, brandMarkUrl } from "../config";
import { normaliseEmail } from "../cue/money";
import { magicLinkEmail } from "../email/templates";
import { sendAndLog } from "../email/send";
import { getSupabaseAdmin } from "../supabase/server";
import { createServerSupabase } from "../supabase/ssr";

/**
 * The one place a magic link is sent.
 *
 * We generate the link ourselves and deliver it through Resend with our own
 * branded template, so Supabase never sends anything. Doing it this way also
 * avoids two traps in the default Supabase email path: the wrong template firing
 * for new versus returning users, and the PKCE code redirect that our confirm
 * route cannot use. Our link always carries a token_hash, which verifyOtp reads
 * directly, works cross device, and needs no template configuration.
 *
 * While our sending domain is unverified, Resend only delivers to the account
 * owner. So if our own send does not go out, we fall back to letting Supabase
 * deliver its own email, which reaches any address. The confirm route handles
 * both link shapes, so the fallback link still works.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const clean = normaliseEmail(email);
  if (!clean.includes("@")) {
    throw new Error(`"${email}" does not look like a valid email address. Check it and try again.`);
  }

  if (await sendOwnMagicLink(clean)) return;
  await sendSupabaseMagicLink(clean);
}

/**
 * Primary path. Returns true when our branded email went out, false when it did
 * not, so the caller can fall back.
 */
async function sendOwnMagicLink(email: string): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });

    const hashed = data?.properties?.hashed_token;
    const type = data?.properties?.verification_type;
    if (error || !hashed || !type) return false;

    const signInUrl = `${appUrl()}/auth/confirm?token_hash=${encodeURIComponent(
      hashed,
    )}&type=${encodeURIComponent(type)}`;

    const { subject, html } = magicLinkEmail({ signInUrl, markUrl: brandMarkUrl() });
    const result = await sendAndLog({ to: email, subject, html, type: "sign_in", transactionId: null });
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * Fallback path. Lets Supabase send the email, which reaches any address even
 * while our own domain is unverified. Throws only if this also fails, so the
 * sign in action can tell the person to try again.
 */
async function sendSupabaseMagicLink(email: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${appUrl()}/auth/confirm`,
    },
  });

  if (error) {
    throw new Error("We could not send the sign in email just now. Wait a moment and try again.");
  }
}
