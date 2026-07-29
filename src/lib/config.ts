import "server-only";

/**
 * Central place for required server configuration.
 *
 * Every getter throws with an actionable message when its variable is missing.
 * The reads are lazy rather than top level so that importing this module during
 * a build does not fail before the environment is populated.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local, see .env.example for the full list.`,
    );
  }
  return value.trim();
}

/**
 * The wallet funds are sent from when a recipient claims.
 */
export function treasuryWalletId(): string {
  return requireEnv("TREASURY_WALLET_ID");
}

export function treasuryWalletAddress(): string {
  return requireEnv("TREASURY_WALLET_ADDRESS");
}

/**
 * Wallet set that every Cue recipient wallet is created inside.
 */
export function circleWalletSetId(): string {
  return requireEnv("CIRCLE_WALLET_SET_ID");
}

export function resendApiKey(): string {
  return requireEnv("RESEND_API_KEY");
}

/**
 * Public Supabase project URL and anon key, safe to expose to the browser. Used
 * by the auth clients for email sign in.
 */
export function supabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * Secret for signing scoped session cookies, the kind minted when someone
 * collects money without a full sign in. Reuses the API secret so no new
 * variable is needed.
 */
export function sessionSecret(): string {
  return requireEnv("CUE_API_SECRET");
}

/**
 * Public base URL, used to build claim links that land in email.
 */
export function appUrl(): string {
  return requireEnv("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "");
}

/**
 * Absolute URL to the brand mark PNG used in email headers. Must be absolute so
 * email clients can fetch it.
 */
export function brandMarkUrl(): string {
  return `${appUrl()}/brand/mark.png`;
}

/**
 * Sender address for outbound email. Resend's shared onboarding domain works
 * without domain verification but can only deliver to the Resend account owner.
 */
export const EMAIL_FROM = "Cue <onboarding@resend.dev>";

/**
 * How long the sender keeps an exclusive cancel window, in seconds.
 * Claims unlock once this window has passed.
 */
export const DEFAULT_CANCEL_WINDOW_SECONDS = 60 * 60;

/**
 * Shared secret required on POST /api/send until real auth lands. The MCP
 * server will send the same value.
 */
export function cueApiSecret(): string {
  return requireEnv("CUE_API_SECRET");
}

/**
 * Secret Vercel Cron includes as a bearer token when it triggers the scheduled
 * payments job, so only Vercel can run it. Set the same value as the CRON_SECRET
 * project env var in Vercel.
 */
export function cronSecret(): string {
  return requireEnv("CRON_SECRET");
}

/**
 * Largest amount a single send may move, in dollars. Capped low while on
 * testnet, raised later by changing the env var. Defaults to 5 if unset.
 */
export function maxSendUsdc(): number {
  const raw = process.env.CUE_MAX_SEND_USDC;
  const value = raw ? Number(raw) : 5;
  return Number.isFinite(value) && value > 0 ? value : 5;
}

/**
 * Whether cancel windows shorter than the default are allowed. Off unless the
 * env flag is explicitly "true", so production always enforces the full window.
 */
export function allowShortCancelWindow(): boolean {
  return process.env.CUE_ALLOW_SHORT_WINDOW === "true";
}
