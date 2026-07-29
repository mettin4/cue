/**
 * Money helpers.
 *
 * Amounts are handled as strings end to end. The column is numeric(18,6) and
 * PostgREST can hand numeric back as a JavaScript number, which is not safe for
 * money, so everything is normalised to a fixed decimal string instead.
 */

export const MIN_AMOUNT = 0.01;
export const MAX_DECIMAL_PLACES = 2;

/**
 * Validates an amount and returns it as a canonical two decimal string.
 * Throws with a message that is safe to show to a user.
 */
export function parseAmount(input: string | number): string {
  const raw = typeof input === "number" ? String(input) : input.trim();

  if (!raw) {
    throw new Error("Amount is required.");
  }

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(
      `Amount "${raw}" is not a valid number. Use a plain decimal such as 12.50.`,
    );
  }

  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  if (decimals > MAX_DECIMAL_PLACES) {
    throw new Error(
      `Amount "${raw}" has ${decimals} decimal places. Use at most ${MAX_DECIMAL_PLACES}, such as 12.50.`,
    );
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Amount must be greater than zero. Enter something like 5.00.");
  }

  if (value < MIN_AMOUNT) {
    throw new Error(`Amount must be at least ${MIN_AMOUNT.toFixed(2)}.`);
  }

  return value.toFixed(MAX_DECIMAL_PLACES);
}

/**
 * Normalises whatever the database returned into a two decimal string.
 */
export function toAmountString(value: string | number | null): string {
  if (value === null) return "0.00";
  return Number(value).toFixed(MAX_DECIMAL_PLACES);
}

/**
 * Adds two amount strings without floating point drift at the cent level.
 */
export function addAmounts(a: string, b: string): string {
  const cents = Math.round(Number(a) * 100) + Math.round(Number(b) * 100);
  return (cents / 100).toFixed(MAX_DECIMAL_PLACES);
}

/**
 * Normalises an email for storage and comparison.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Masks an email for display to the other party, for example
 * "alex@example.com" becomes "a***@example.com".
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "someone";
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}
