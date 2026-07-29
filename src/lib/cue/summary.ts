import "server-only";

import { listContacts } from "./contacts";
import { addAmounts, maskEmail, normaliseEmail, toAmountString } from "./money";
import { getSupabaseAdmin } from "../supabase/server";
import type { TransactionRow, UserRow } from "./types";

export type SummaryPeriod = "this_week" | "this_month" | "last_month" | "custom";

export type SpendingSummary = {
  periodLabel: string;
  totalSent: string;
  totalReceived: string;
  transfers: number;
  top: { label: string; amount: string; share: number }[];
};

function startOfDayUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Turns a period into a UTC start and exclusive end, plus a label a person would
 * recognise.
 */
function resolveRange(
  period: SummaryPeriod,
  now: Date,
  from?: string,
  to?: string,
): { start: Date; end: Date; label: string } {
  if (period === "this_week") {
    const day = now.getUTCDay(); // 0 Sunday .. 6 Saturday
    const sinceMonday = (day + 6) % 7;
    const start = new Date(startOfDayUTC(now));
    start.setUTCDate(start.getUTCDate() - sinceMonday);
    return { start, end: now, label: "this week" };
  }
  if (period === "last_month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { start, end, label: "last month" };
  }
  if (period === "custom" && from && to) {
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const start = new Date(Date.UTC(fy, fm - 1, fd));
    // Inclusive end date, so add a day for the exclusive upper bound.
    const end = new Date(Date.UTC(ty, tm - 1, td + 1));
    return { start, end, label: `from ${from} to ${to}` };
  }
  // this_month, and the default.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end: now, label: "this month" };
}

const ROW = "id, sender_id, recipient_email, amount_usdc, status, created_at";

/**
 * A summary of money in and out over a period, with the top recipients by amount.
 * Recipients are named by their saved contact when one exists, and masked
 * otherwise.
 */
export async function getSpendingSummary(
  user: UserRow,
  options: { period?: SummaryPeriod; from?: string; to?: string } = {},
  now: Date = new Date(),
): Promise<SpendingSummary> {
  const supabase = getSupabaseAdmin();
  const { start, end, label } = resolveRange(options.period ?? "this_month", now, options.from, options.to);

  const [outgoing, incoming] = await Promise.all([
    supabase
      .from("transactions")
      .select(ROW)
      .eq("sender_id", user.id)
      .in("status", ["pending_claim", "claimed"])
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    supabase
      .from("transactions")
      .select(ROW)
      .eq("recipient_email", normaliseEmail(user.email))
      .eq("status", "claimed")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
  ]);

  const outRows = (outgoing.data ?? []) as TransactionRow[];
  const inRows = (incoming.data ?? []) as TransactionRow[];

  const totalSent = outRows.reduce((t, r) => addAmounts(t, toAmountString(r.amount_usdc)), "0.00");
  const totalReceived = inRows.reduce((t, r) => addAmounts(t, toAmountString(r.amount_usdc)), "0.00");

  // Group outgoing by recipient to find the biggest.
  const byRecipient = new Map<string, string>();
  for (const row of outRows) {
    const key = normaliseEmail(row.recipient_email);
    byRecipient.set(key, addAmounts(byRecipient.get(key) ?? "0.00", toAmountString(row.amount_usdc)));
  }

  const contacts = await listContacts(user.id);
  const nameByEmail = new Map(contacts.map((c) => [normaliseEmail(c.email), c.name]));

  const sentCents = Math.round(Number(totalSent) * 100);
  const top = [...byRecipient.entries()]
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([email, amount]) => ({
      label: nameByEmail.get(email) ?? maskEmail(email),
      amount,
      // Percentage of the total sent, to two decimals.
      share: sentCents > 0 ? Math.round((Math.round(Number(amount) * 100) / sentCents) * 10000) / 100 : 0,
    }));

  return {
    periodLabel: label,
    totalSent,
    totalReceived,
    transfers: outRows.length,
    top,
  };
}
