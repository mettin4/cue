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

/**
 * Picks the account with the most activity to show by default, so a visitor who
 * lands on the dashboard without choosing an account still sees a populated
 * page rather than a dead end. Falls back to the earliest user.
 */
const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

function isPersonalDomain(email: string): boolean {
  const domain = email.split("@")[1] ?? "";
  return PERSONAL_DOMAINS.has(domain);
}

export async function pickDemoUser(): Promise<UserRow | null> {
  const supabase = getSupabaseAdmin();

  const { data: users } = await supabase
    .from("users")
    .select("id, email, circle_wallet_id, circle_wallet_address, created_at")
    .order("created_at", { ascending: true });

  if (!users || users.length === 0) return null;

  const { data: txs } = await supabase
    .from("transactions")
    .select("sender_id, recipient_email, status")
    .limit(500);

  // Score each account by how well it demonstrates the product: a funded
  // account with a mix of statuses beats an empty one with a single status.
  // Real personal email providers are penalised heavily so the public default
  // never lands on someone's own address, even masked.
  let bestUser: UserRow | null = null;
  let bestScore = -Infinity;

  for (const user of users as UserRow[]) {
    const email = normaliseEmail(user.email);
    const statuses = new Set<string>();
    let count = 0;
    for (const tx of txs ?? []) {
      if (tx.sender_id === user.id || normaliseEmail(tx.recipient_email) === email) {
        statuses.add(tx.status);
        count += 1;
      }
    }

    const score =
      (user.circle_wallet_id ? 100 : 0) + // a real balance matters most
      statuses.size * 10 + // a mix of collected / waiting / called back
      Math.min(count, 9) + // some activity, capped so it never dominates
      (isPersonalDomain(email) ? -1000 : 0); // keep a real address off the default

    if (score > bestScore) {
      bestScore = score;
      bestUser = user;
    }
  }

  return bestUser ?? (users[0] as UserRow);
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

/**
 * Dev only helper backing the user switcher. Returns a role label instead of a
 * handle so no identifiable address renders in the control. Removed once sign
 * in ships.
 */
export async function listDevUsers(): Promise<
  { id: string; email: string; role: "sender" | "recipient" }[]
> {
  const supabase = getSupabaseAdmin();

  const { data: users } = await supabase
    .from("users")
    .select("id, email")
    .order("created_at", { ascending: true })
    .limit(20);

  const { data: senders } = await supabase
    .from("transactions")
    .select("sender_id")
    .limit(500);

  const senderIds = new Set((senders ?? []).map((s) => s.sender_id));

  // Never list a real personal address in the public switcher, even masked.
  return (users ?? [])
    .filter((u) => !isPersonalDomain(normaliseEmail(u.email)))
    .map((u) => ({
      id: u.id,
      email: u.email,
      role: senderIds.has(u.id) ? "sender" : "recipient",
    }));
}
