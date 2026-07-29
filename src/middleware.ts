import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and passes the updated
 * cookies through, which is what keeps a signed in session alive. It does not
 * gate any route: the dashboard shows a signed out state itself rather than
 * bouncing people to a locked door.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching getUser refreshes the tokens when they are close to expiring.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on pages and server actions to keep the cookie session fresh. Skip static
  // assets and every API route: those authenticate by connect token or shared
  // secret, never a cookie, so a session refresh has nothing to do there.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand|api).*)"],
};
