import "server-only";

import { appUrl } from "../config";
import { normaliseEmail } from "../cue/money";
import { createServerSupabase } from "../supabase/ssr";

/**
 * The one place a magic link is sent.
 *
 * Today it hands off to Supabase Auth, which delivers the email from its own
 * sender and creates the account on first sign in. When our sending domain is
 * verified, this is the single function that changes: it will render the branded
 * magicLinkEmail template and send through Resend, either from Supabase's send
 * email hook or a hand rolled token. Nothing else in the app needs to know.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const clean = normaliseEmail(email);
  if (!clean.includes("@")) {
    throw new Error(`"${email}" does not look like a valid email address. Check it and try again.`);
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${appUrl()}/auth/confirm`,
    },
  });

  if (error) {
    throw new Error(
      "We could not send the sign in email just now. Wait a moment and try again.",
    );
  }
}
