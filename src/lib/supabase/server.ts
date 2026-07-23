import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server side Supabase client.
 *
 * Uses the service role key, which bypasses row level security. This module is
 * marked "server-only" so importing it from a client component is a build
 * error. Never expose this client or its key to the browser.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local, see .env.example for the full list.`,
    );
  }
  return value;
}

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  cached = createClient(url, serviceRoleKey, {
    auth: {
      // No user session on the server, so do not persist or refresh tokens.
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cached;
}
