import "server-only";

import { brandMarkUrl } from "../config";
import { debtReminderEmail } from "../email/templates";
import { sendAndLog } from "../email/send";
import { listContacts } from "./contacts";
import { maskEmail, normaliseEmail, parseAmount, toAmountString } from "./money";
import { createSend } from "./send";
import { getSupabaseAdmin } from "../supabase/server";
import type { DebtDirection, DebtRow, UserRow } from "./types";

const FIELDS =
  "id, account_id, counterparty_name, counterparty_email, amount, direction, note, status, created_at, settled_at, last_reminded_at";

export type Counterparty = { email: string | null; name: string | null; label: string };

/**
 * Works out who a debt is with. An at sign is an email. Otherwise the name is
 * matched against contacts: one match resolves to that person, several come back
 * as a question, and none is kept as a plain name so a debt can still be tracked
 * with someone who is not saved.
 */
export async function resolveCounterparty(
  userId: string,
  input: string,
): Promise<Counterparty> {
  const value = input.trim();
  if (!value) throw new Error("Tell me who the debt is with, by name or email.");

  if (value.includes("@")) {
    const email = normaliseEmail(value);
    return { email, name: null, label: email };
  }

  const contacts = await listContacts(userId);
  const lower = value.toLowerCase();
  const exact = contacts.filter((c) => c.name.toLowerCase() === lower);
  const matches = exact.length > 0 ? exact : contacts.filter((c) => c.name.toLowerCase().includes(lower));

  if (matches.length === 1) {
    return { email: matches[0].email, name: matches[0].name, label: `${matches[0].name} (${matches[0].email})` };
  }
  if (matches.length > 1) {
    const names = matches.map((m) => m.name).join(", ");
    throw new Error(
      `More than one contact matches "${value}": ${names}. Tell me which one, or give me the email address.`,
    );
  }
  // Unknown name, tracked as a plain label with no email.
  return { email: null, name: value, label: value };
}

export async function trackDebt(params: {
  userId: string;
  counterparty: string;
  amount: string | number;
  direction: DebtDirection;
  note?: string;
}): Promise<{ debt: DebtRow; label: string }> {
  const amount = parseAmount(params.amount);
  const who = await resolveCounterparty(params.userId, params.counterparty);

  const { data, error } = await getSupabaseAdmin()
    .from("debts")
    .insert({
      account_id: params.userId,
      counterparty_name: who.name,
      counterparty_email: who.email,
      amount,
      direction: params.direction,
      note: params.note?.trim() || null,
      status: "open",
    })
    .select(FIELDS)
    .single<DebtRow>();

  if (error || !data) throw new Error(`Could not record the debt: ${error?.message ?? "no row"}`);
  return { debt: data, label: who.label };
}

export type PersonDebts = {
  label: string;
  email: string | null;
  theyOwe: string;
  iOwe: string;
  net: number; // positive: they owe you; negative: you owe them
  items: { id: string; amount: string; direction: DebtDirection; note: string | null }[];
};

/**
 * Open debts grouped by person, with the net position for each. People are keyed
 * by email when known, otherwise by name.
 */
export async function listDebts(userId: string): Promise<PersonDebts[]> {
  const { data } = await getSupabaseAdmin()
    .from("debts")
    .select(FIELDS)
    .eq("account_id", userId)
    .eq("status", "open")
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as DebtRow[];
  const groups = new Map<string, PersonDebts>();

  for (const row of rows) {
    const key = row.counterparty_email
      ? `email:${normaliseEmail(row.counterparty_email)}`
      : `name:${(row.counterparty_name ?? "someone").toLowerCase()}`;

    const label = row.counterparty_name
      ? row.counterparty_name
      : row.counterparty_email
        ? maskEmail(row.counterparty_email)
        : "someone";

    let person = groups.get(key);
    if (!person) {
      person = { label, email: row.counterparty_email, theyOwe: "0.00", iOwe: "0.00", net: 0, items: [] };
      groups.set(key, person);
    }

    const amount = toAmountString(row.amount);
    if (row.direction === "they_owe") {
      person.theyOwe = (Number(person.theyOwe) + Number(amount)).toFixed(2);
    } else {
      person.iOwe = (Number(person.iOwe) + Number(amount)).toFixed(2);
    }
    person.items.push({ id: row.id, amount, direction: row.direction, note: row.note });
  }

  const people = [...groups.values()];
  for (const p of people) p.net = Math.round((Number(p.theyOwe) - Number(p.iOwe)) * 100) / 100;
  return people;
}

export async function getDebt(userId: string, id: string): Promise<DebtRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("debts")
    .select(FIELDS)
    .eq("id", id)
    .eq("account_id", userId)
    .maybeSingle<DebtRow>();
  return data ?? null;
}

/**
 * Marks a debt settled. Returns the row, or null when nothing open matched.
 */
export async function settleDebt(userId: string, id: string): Promise<DebtRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("debts")
    .update({ status: "settled", settled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", userId)
    .eq("status", "open")
    .select(FIELDS)
    .maybeSingle<DebtRow>();
  return data ?? null;
}

/**
 * Whether a reminder may be sent for a debt, respecting the one per day rule.
 */
export function canRemind(debt: DebtRow, now: Date = new Date()): { ok: boolean; nextAt?: Date } {
  if (!debt.last_reminded_at) return { ok: true };
  const last = new Date(debt.last_reminded_at);
  const nextAt = new Date(last.getTime() + 24 * 60 * 60 * 1000);
  return now >= nextAt ? { ok: true } : { ok: false, nextAt };
}

export async function markReminded(id: string, now: Date = new Date()): Promise<void> {
  await getSupabaseAdmin()
    .from("debts")
    .update({ last_reminded_at: now.toISOString() })
    .eq("id", id);
}

/**
 * Settles a debt you owe by actually sending the money, then marking it settled.
 * The send goes through createSend, so the amount limit, balance check and
 * spending limits all apply. Callers gate this behind an explicit confirmation.
 */
export async function settleBySend(
  user: UserRow,
  debtId: string,
): Promise<{ amount: string; label: string; recipientEmail: string }> {
  const debt = await getDebt(user.id, debtId);
  if (!debt) throw new Error("I could not find that debt for this account.");
  if (debt.status !== "open") throw new Error("That debt is already settled.");
  if (debt.direction !== "i_owe") {
    throw new Error("This is money owed to you, so there is nothing to send.");
  }
  if (!debt.counterparty_email) {
    throw new Error(
      "This debt has no email on file, so it cannot be settled by sending. Save the person as a contact with their email, or settle it without sending.",
    );
  }

  const amount = toAmountString(debt.amount);
  await createSend({
    senderUserId: user.id,
    recipientEmail: debt.counterparty_email,
    amountUsdc: amount,
  });
  await settleDebt(user.id, debtId);

  return {
    amount,
    label: debt.counterparty_name ?? maskEmail(debt.counterparty_email),
    recipientEmail: debt.counterparty_email,
  };
}

/**
 * Emails a friendly reminder to someone who owes you, respecting the one per day
 * rule. Throws with an actionable message when a reminder is not allowed.
 */
export async function sendDebtReminder(
  user: UserRow,
  debtId: string,
): Promise<{ label: string; amount: string }> {
  const debt = await getDebt(user.id, debtId);
  if (!debt) throw new Error("I could not find that debt for this account.");
  if (debt.status !== "open") throw new Error("That debt is settled, so there is nothing to remind about.");
  if (debt.direction !== "they_owe") {
    throw new Error("This is money you owe, so there is no one to remind. Ask me to settle it instead.");
  }
  if (!debt.counterparty_email) {
    throw new Error(
      "This debt has no email on file, so I cannot send a reminder. Save the person as a contact with their email first.",
    );
  }

  const allowed = canRemind(debt);
  if (!allowed.ok) {
    throw new Error(
      "You already sent a reminder for this today. You can send another one tomorrow, so nobody gets spammed.",
    );
  }

  const amount = toAmountString(debt.amount);
  const { subject, html } = debtReminderEmail({
    amount,
    fromLabel: maskEmail(user.email),
    note: debt.note,
    markUrl: brandMarkUrl(),
  });
  const result = await sendAndLog({
    to: debt.counterparty_email,
    subject,
    html,
    type: "debt_reminder",
    transactionId: null,
  });
  if (!result.ok) {
    throw new Error("I could not send the reminder right now. Please try again in a moment.");
  }
  await markReminded(debt.id);

  return { label: debt.counterparty_name ?? maskEmail(debt.counterparty_email), amount };
}
