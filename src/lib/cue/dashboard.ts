import "server-only";

import { getWalletBalance } from "../circle/wallets";
import { getSupabaseAdmin } from "../supabase/server";
import { addAmounts, maskEmail, normaliseEmail, toAmountString } from "./money";
import type { TransactionRow, TransactionStatus, UserRow } from "./types";

export type ActivityItem = {
  id: string;
  amount: string;
  status: TransactionStatus;
  counterparty: string;
  createdAt: string | null;
  secondsUntilUnlock: number;
  canCancel: boolean;
  /** Which way the money is moving from the viewer's point of view. */
  direction: "in" | "out";
};

export type DashboardStats = {
  totalSent: string;
  totalReceived: string;
  pendingCount: number;
};

export type DashboardData = {
  user: UserRow;
  balance: string;
  hasAccount: boolean;
  /** Sent and received merged into one feed, newest first. */
  activity: ActivityItem[];
  stats: DashboardStats;
};

/**
 * Accepts either a user id or an email so links from the claim page keep
 * working. Phase 5 replaces this with the signed in user.
 */
export async function resolveDashboardUser(
  identifier: string,
): Promise<UserRow | null> {
  const supabase = getSupabaseAdmin();
  const value = identifier.trim();
  if (!value) return null;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  const query = supabase
    .from("users")
    .select("id, email, circle_wallet_id, circle_wallet_address, created_at");

  const { data } = isUuid
    ? await query.eq("id", value).maybeSingle<UserRow>()
    : await query.eq("email", normaliseEmail(value)).maybeSingle<UserRow>();

  return data ?? null;
}

function secondsUntil(deadline: string | null): number {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
}

function toActivity(
  row: TransactionRow,
  counterparty: string,
  direction: "in" | "out",
): ActivityItem {
  return {
    id: row.id,
    amount: toAmountString(row.amount_usdc),
    status: row.status,
    // Always masked. Never let a raw address reach the UI on a public page.
    counterparty: maskEmail(counterparty),
    createdAt: row.created_at,
    secondsUntilUnlock: secondsUntil(row.cancel_deadline),
    // Only the sender can call money back, and only before it is collected.
    canCancel: direction === "out" && row.status === "pending_claim",
    direction,
  };
}

const ROW_FIELDS =
  "id, sender_id, recipient_email, amount_usdc, status, cancel_deadline, created_at, claimed_at, circle_tx_id, claim_token";

export async function getDashboardData(user: UserRow): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();

  const [outgoingResult, incomingResult] = await Promise.all([
    supabase
      .from("transactions")
      .select(ROW_FIELDS)
      .eq("sender_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("transactions")
      .select(ROW_FIELDS)
      .eq("recipient_email", normaliseEmail(user.email))
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const outgoingRows = (outgoingResult.data ?? []) as TransactionRow[];
  const incomingRows = (incomingResult.data ?? []) as TransactionRow[];

  // Name the other side of each incoming transfer without exposing full emails.
  const senderIds = [
    ...new Set(incomingRows.map((row) => row.sender_id).filter(Boolean)),
  ] as string[];

  const senderEmails = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: senders } = await supabase
      .from("users")
      .select("id, email")
      .in("id", senderIds);

    for (const sender of senders ?? []) {
      senderEmails.set(sender.id, sender.email);
    }
  }

  const activity = [
    ...outgoingRows.map((row) => toActivity(row, row.recipient_email, "out")),
    ...incomingRows.map((row) => {
      const email = row.sender_id ? senderEmails.get(row.sender_id) : undefined;
      return toActivity(row, email ? maskEmail(email) : "Someone", "in");
    }),
  ].sort((a, b) => {
    const left = a.createdAt ? Date.parse(a.createdAt) : 0;
    const right = b.createdAt ? Date.parse(b.createdAt) : 0;
    return right - left;
  });

  // Stats summarise settled money. Sent and received only count collected
  // transfers, since pending ones have not moved yet.
  const stats: DashboardStats = {
    totalSent: outgoingRows
      .filter((row) => row.status === "claimed")
      .reduce((total, row) => addAmounts(total, toAmountString(row.amount_usdc)), "0.00"),
    totalReceived: incomingRows
      .filter((row) => row.status === "claimed")
      .reduce((total, row) => addAmounts(total, toAmountString(row.amount_usdc)), "0.00"),
    pendingCount: activity.filter((item) => item.status === "pending_claim").length,
  };

  let balance = "0.00";
  const hasAccount = Boolean(user.circle_wallet_id);

  if (user.circle_wallet_id) {
    try {
      const result = await getWalletBalance(user.circle_wallet_id);
      balance = toAmountString(result.amount);
    } catch {
      // A balance lookup problem should not take the whole page down.
      balance = "0.00";
    }
  }

  return { user, balance, hasAccount, activity, stats };
}
