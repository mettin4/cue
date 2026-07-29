import "server-only";

import { getSupabaseAdmin } from "../supabase/server";
import { toAmountString } from "./money";
import type { UserRow } from "./types";

/**
 * Spending limits are a safety control for an agent that can move money. They
 * live on the account and are enforced in the send path, so every route that
 * moves money is covered by one check.
 */

function startOfDayUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function startOfNextDayUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
function startOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
function startOfNextMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function cents(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}
function fromCents(c: number): string {
  return (c / 100).toFixed(2);
}

/**
 * A plain UTC date like "August 1, 2026", used to say when a limit resets.
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type Limits = { daily: string | null; monthly: string | null };

export async function getLimits(userId: string): Promise<Limits> {
  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("daily_limit_usdc, monthly_limit_usdc")
    .eq("id", userId)
    .maybeSingle<Pick<UserRow, "daily_limit_usdc" | "monthly_limit_usdc">>();

  return {
    daily: data?.daily_limit_usdc == null ? null : toAmountString(data.daily_limit_usdc),
    monthly: data?.monthly_limit_usdc == null ? null : toAmountString(data.monthly_limit_usdc),
  };
}

/**
 * Sets or clears the limits. A field left undefined is untouched; a field set to
 * null clears that limit. Returns the limits after the change.
 */
export async function setLimits(
  userId: string,
  next: { daily?: number | null; monthly?: number | null },
): Promise<Limits> {
  const patch: Record<string, number | null> = {};
  if (next.daily !== undefined) patch.daily_limit_usdc = next.daily;
  if (next.monthly !== undefined) patch.monthly_limit_usdc = next.monthly;

  const { error } = await getSupabaseAdmin().from("users").update(patch).eq("id", userId);
  if (error) throw new Error(`Could not update the limit: ${error.message}`);

  return getLimits(userId);
}

/**
 * Total moved out of an account since a moment, counting sends that are settled
 * or still waiting to be collected. Cancelled and failed sends do not count,
 * since they took nothing.
 */
async function spentSince(userId: string, since: Date): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from("transactions")
    .select("amount_usdc")
    .eq("sender_id", userId)
    .in("status", ["pending_claim", "claimed"])
    .gte("created_at", since.toISOString());

  return (data ?? []).reduce((total, row) => total + cents(row.amount_usdc), 0);
}

export type LimitUsage = {
  limit: string;
  spent: string;
  remaining: string;
  resetsOn: string;
};

export type Usage = {
  daily: LimitUsage | null;
  monthly: LimitUsage | null;
};

/**
 * How much of each limit is used and when it resets, for display and for
 * folding into the balance summary. Null for a limit that is not set.
 */
export async function getUsage(userId: string, now: Date = new Date()): Promise<Usage> {
  const limits = await getLimits(userId);

  const daily = limits.daily
    ? await usageFor(userId, limits.daily, startOfDayUTC(now), startOfNextDayUTC(now))
    : null;
  const monthly = limits.monthly
    ? await usageFor(userId, limits.monthly, startOfMonthUTC(now), startOfNextMonthUTC(now))
    : null;

  return { daily, monthly };
}

async function usageFor(
  userId: string,
  limit: string,
  windowStart: Date,
  resetAt: Date,
): Promise<LimitUsage> {
  const spent = await spentSince(userId, windowStart);
  const remaining = Math.max(0, cents(limit) - spent);
  return {
    limit,
    spent: fromCents(spent),
    remaining: fromCents(remaining),
    resetsOn: formatDate(resetAt),
  };
}

/**
 * Throws with an actionable message when a send of `amount` would breach either
 * limit. Called from createSend, so the MCP tools, the API, split and scheduled
 * payments are all covered. The daily limit is checked first.
 */
export async function assertWithinLimits(
  userId: string,
  amount: string | number,
  now: Date = new Date(),
): Promise<void> {
  const limits = await getLimits(userId);
  if (!limits.daily && !limits.monthly) return;

  const add = cents(amount);

  if (limits.daily) {
    const spent = await spentSince(userId, startOfDayUTC(now));
    const remaining = Math.max(0, cents(limits.daily) - spent);
    if (spent + add > cents(limits.daily)) {
      throw new Error(
        `This would go over your daily limit of ${fromCents(cents(limits.daily))} dollars. ` +
          `You have ${fromCents(remaining)} dollars left today, which resets at midnight UTC on ${formatDate(
            startOfNextDayUTC(now),
          )}. Try a smaller amount or raise the limit.`,
      );
    }
  }

  if (limits.monthly) {
    const spent = await spentSince(userId, startOfMonthUTC(now));
    const remaining = Math.max(0, cents(limits.monthly) - spent);
    if (spent + add > cents(limits.monthly)) {
      throw new Error(
        `This would go over your monthly limit of ${fromCents(cents(limits.monthly))} dollars. ` +
          `You have ${fromCents(remaining)} dollars left this month, which resets on ${formatDate(
            startOfNextMonthUTC(now),
          )}. Try a smaller amount or raise the limit.`,
      );
    }
  }
}

/**
 * Whether a proposed change loosens a safety control, meaning it lets the account
 * spend more than before: raising a limit, or removing one. Setting a first limit
 * or lowering one does not loosen. Used to decide when to require confirmation.
 */
export function loosensLimits(
  current: Limits,
  next: { daily?: number | null; monthly?: number | null },
): boolean {
  const loosensOne = (cur: string | null, proposed: number | null | undefined): boolean => {
    if (proposed === undefined) return false; // untouched
    if (proposed === null) return cur !== null; // removing an existing limit loosens
    if (cur === null) return false; // setting a first limit tightens
    return proposed > Number(cur); // raising loosens
  };

  return loosensOne(current.daily, next.daily) || loosensOne(current.monthly, next.monthly);
}
