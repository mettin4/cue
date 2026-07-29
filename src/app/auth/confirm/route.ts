import { redirect } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";

import { createServerSupabase } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

/**
 * Where a magic link lands. Verifying the token proves the email and sets the
 * session cookies, then sends the person on to the dashboard. A bad or expired
 * link falls through to the dashboard, which shows the signed out state with a
 * short message rather than an error page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (tokenHash && type) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
  }

  redirect("/dashboard?signin=expired");
}
