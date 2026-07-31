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
 * Sender and reply-to for outbound email, on our verified cueworks.net domain,
 * so mail delivers to anyone rather than only the Resend account owner. "hello"
 * reads as a real person to write back to, and doubles as the reply-to.
 */
export const EMAIL_FROM = "Cue <hello@cueworks.net>";
export const EMAIL_REPLY_TO = "hello@cueworks.net";

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

/** Reads a positive dollar amount from an env var, or a default. */
function dollarsEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Treasury protection while the demo is public and signups are free.
 *
 * The treasury funds every send, so a fresh account loop could drain it. These
 * guards make that impossible without any fraud machinery: a floor the balance
 * can never drop below, a cap on how much the whole demo can send in a day, and
 * an alert address to warn when it runs low. All three are env tunable.
 */
export function treasuryFloorUsdc(): number {
  return dollarsEnv("CUE_TREASURY_FLOOR_USDC", 5);
}

export function treasuryDailyCapUsdc(): number {
  return dollarsEnv("CUE_TREASURY_DAILY_CAP_USDC", 50);
}

export function treasuryAlertUsdc(): number {
  return dollarsEnv("CUE_TREASURY_ALERT_USDC", 10);
}

/** Where low balance alerts go. Alerts are skipped when this is unset. */
export function treasuryAlertEmail(): string | null {
  const value = process.env.CUE_ALERT_EMAIL?.trim();
  return value && value.includes("@") ? value : null;
}

/**
 * Test funds while on testnet. There is no real on ramp: clicking Add Money
 * grants a small fixed amount from the same demo pool that funds sends. Three
 * caps stop a signup loop from draining it, all sitting under the treasury
 * floor and daily cap: a fixed grant per request, a lifetime total per account,
 * and a cooldown between grants. All env tunable.
 */
export function fundAmountUsdc(): number {
  return dollarsEnv("CUE_FUND_AMOUNT_USDC", 10);
}

export function fundAccountCapUsdc(): number {
  return dollarsEnv("CUE_FUND_ACCOUNT_CAP_USDC", 30);
}

export function fundCooldownSeconds(): number {
  const raw = process.env.CUE_FUND_COOLDOWN_SECONDS;
  const value = raw ? Number(raw) : 300;
  return Number.isFinite(value) && value >= 0 ? value : 300;
}

/**
 * Whether cancel windows shorter than the default are allowed. Off unless the
 * env flag is explicitly "true", so production always enforces the full window.
 */
export function allowShortCancelWindow(): boolean {
  return process.env.CUE_ALLOW_SHORT_WINDOW === "true";
}
