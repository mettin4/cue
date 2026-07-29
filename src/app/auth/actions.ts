"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { clientIp, rateLimit, RateLimitError } from "@/lib/api/guard";
import { sendMagicLink } from "@/lib/auth/magic-link";
import { clearScopedSession } from "@/lib/auth/scoped";
import { normaliseEmail } from "@/lib/cue/money";
import { createServerSupabase } from "@/lib/supabase/ssr";

export type SignInState = { ok: boolean; message: string };

/**
 * Requests a magic link. Rate limited per email and per IP so nobody can be used
 * to flood an inbox.
 */
export async function requestSignIn(email: string): Promise<SignInState> {
  const clean = normaliseEmail(email ?? "");
  if (!clean.includes("@")) {
    return { ok: false, message: "Enter a valid email address, like you@example.com." };
  }

  try {
    const headerList = await headers();
    const ip = clientIp({ headers: headerList } as unknown as Request);
    // Three links per email per 10 minutes, and a looser cap per IP.
    rateLimit(`signin:email:${clean}`, 3, 10 * 60_000);
    rateLimit(`signin:ip:${ip}`, 15, 10 * 60_000);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        ok: false,
        message: "Too many sign in emails were requested. Wait a few minutes and try again.",
      };
    }
    throw error;
  }

  try {
    await sendMagicLink(clean);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Something went wrong. Try again shortly.",
    };
  }

  return {
    ok: true,
    message: `Check ${clean} for a sign in link. Open it on this device to finish.`,
  };
}

/**
 * Signs out of both a full session and a scoped one, then returns to the
 * dashboard, which will render the signed out state.
 */
export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  await clearScopedSession();
  redirect("/dashboard");
}
