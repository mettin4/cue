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
