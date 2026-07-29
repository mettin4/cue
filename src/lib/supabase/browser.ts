"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for the browser, used by the sign in form to request a magic
 * link. The anon key is public by design.
 */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
