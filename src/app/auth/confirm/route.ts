import { redirect } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";

import { DISPLAY_FONT_WOFF2_BASE64 } from "@/lib/auth/display-font";
import { createServerSupabase } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

/**
 * Where a magic link lands.
 *
 * The GET does not verify. Email providers and security scanners prefetch links,
 * and verifying is single use, so a prefetch would burn the token before the
 * person clicks. Instead the GET shows a short page with one button. Only the
 * button, a POST, verifies. Prefetchers issue GETs and do not submit forms, so
 * the token survives until a real click.
 *
 * The POST handles both link shapes: our own links carry a token_hash, and the
 * Supabase fallback link carries a PKCE code. Either one sets the session and
 * sends the person to the dashboard; anything invalid or already used falls
 * through to the signed out state with a short message.
 */

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function hidden(name: string, value: string | null): string {
  return value ? `<input type="hidden" name="${name}" value="${esc(value)}" />` : "";
}

function interstitial(params: {
  tokenHash: string | null;
  type: string | null;
  code: string | null;
  next: string;
}): string {
  const mark = `<svg viewBox="0 0 124 120" width="34" height="33" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M 83.6 36.9 A 36 36 0 1 0 83.6 83.1" stroke="#f4f4f5" stroke-width="13" stroke-linecap="round"/><rect x="103" y="37" width="13" height="46" rx="6.5" fill="#38D389"/></svg>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Sign in to Cue</title>
    <style>
      @font-face {
        font-family: 'CueDisplay'; font-style: normal; font-weight: 600; font-display: swap;
        src: url(data:font/woff2;base64,${DISPLAY_FONT_WOFF2_BASE64}) format('woff2');
      }
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        background: #0a0a0b; color: #f4f4f5; padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .card {
        width: 100%; max-width: 400px; background: #121215; border: 1px solid #232327;
        border-radius: 16px; padding: 36px 32px; text-align: center;
        box-shadow: 0 24px 70px -32px rgba(0,0,0,0.9);
      }
      .brand { display: flex; align-items: center; justify-content: center; gap: 9px; }
      .brand span {
        font-family: 'CueDisplay', ui-sans-serif, system-ui, sans-serif;
        font-weight: 600; font-size: 22px; letter-spacing: -0.01em;
      }
      p { font-size: 15px; line-height: 1.5; color: #85858f; margin: 22px 0 24px; }
      button {
        width: 100%; height: 48px; border: 0; border-radius: 10px; cursor: pointer;
        background: #38d389; color: #04120a; font-size: 15px; font-weight: 600;
        font-family: inherit; box-shadow: 0 10px 34px -14px rgba(56,211,137,0.9);
        transition: background-color .15s ease;
      }
      button:hover { background: #45e096; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">${mark}<span>Cue</span></div>
      <p>You are signing in to Cue. One tap finishes it on this device.</p>
      <form method="POST" action="/auth/confirm">
        ${hidden("token_hash", params.tokenHash)}
        ${hidden("type", params.type)}
        ${hidden("code", params.code)}
        ${hidden("next", params.next)}
        <button type="submit">Continue</button>
      </form>
    </div>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  // Nothing to verify: send them to the signed out state.
  if (!tokenHash && !code) redirect("/dashboard?signin=expired");

  return new Response(interstitial({ tokenHash, type, code, next }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const tokenHash = form.get("token_hash");
  const type = form.get("type");
  const code = form.get("code");
  const nextRaw = form.get("next");
  const next = typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : "/dashboard";

  const supabase = await createServerSupabase();

  if (typeof tokenHash === "string" && typeof type === "string") {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) redirect(next);
  } else if (typeof code === "string") {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  redirect("/dashboard?signin=expired");
}
