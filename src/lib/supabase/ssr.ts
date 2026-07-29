import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseAnonKey, supabaseUrl } from "../config";

/**
 * Supabase client bound to the request cookies, for reading and writing the auth
 * session in server components and route handlers.
 *
 * Writing cookies from a server component is not allowed and throws, which is
 * expected: the middleware refreshes the session on every request, so a server
 * component only needs to read. Route handlers can write, so the setAll works
 * there.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component. The middleware handles refresh.
        }
      },
    },
  });
}
