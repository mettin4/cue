import "server-only";

import { brandMarkUrl, maxSendUsdc } from "../config";
import { scheduleFailedEmail } from "../email/templates";
import { sendAndLog } from "../email/send";
import { getSupabaseAdmin } from "../supabase/server";
import { maskEmail, normaliseEmail, parseAmount, toAmountString } from "./money";
import { createSend } from "./send";
import type { ScheduledPaymentRow, UserRow } from "./types";

const FIELDS =
  "id, sender_id, recipient_email, amount_usdc, day_of_month, active, last_run_at, last_error, last_failed_at, created_at";

/**
 * "1st", "2nd", "3rd", "21st" and so on, for a day of the month.
 */
export function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function sameMonthUTC(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

function firstOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * The next calendar date a schedule will run, given the day of month and when it
 * last ran. If it already ran this month, or this month's day has passed, the
 * next run is next month.
 */
export function nextRunDate(
  dayOfMonth: number,
  lastRunAt: string | null,
  now: Date = new Date(),
): Date {
  const ranThisMonth = lastRunAt ? sameMonthUTC(new Date(lastRunAt), now) : false;
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();

  if (ranThisMonth || now.getUTCDate() > dayOfMonth) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return new Date(Date.UTC(year, month, dayOfMonth));
}

/**
 * A plain date like "August 5, 2026", in UTC so it matches when the job runs.
 */
export function formatRunDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type CreateScheduleResult = {
  id: string;
  amount: string;
  recipientEmail: string;
  dayOfMonth: number;
  firstRun: Date;
};

/**
 * Creates a recurring monthly payment. The recipient is stored as an email that
 * was already resolved from a contact if a name was given, so the runner always
 * has a concrete address.
 */
export async function createSchedule(params: {
  senderUserId: string;
  recipientEmail: string;
  amount: string | number;
  dayOfMonth: number;
}): Promise<CreateScheduleResult> {
  const supabase = getSupabaseAdmin();

  const amount = parseAmount(params.amount);
  const recipientEmail = normaliseEmail(params.recipientEmail);

  if (!recipientEmail.includes("@")) {
    throw new Error(
      `"${params.recipientEmail}" does not look like a valid email address. Check the address and try again.`,
    );
  }

  if (!Number.isInteger(params.dayOfMonth) || params.dayOfMonth < 1 || params.dayOfMonth > 28) {
    throw new Error(
      "Pick a day of the month between 1 and 28, so the payment has that day every month.",
    );
  }

  const cap = maxSendUsdc();
  if (Number(amount) > cap) {
    throw new Error(
      `That is more than the current limit of ${cap.toFixed(2)} dollars per payment. Try a smaller amount.`,
    );
  }

  const { data: sender, error: senderError } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", params.senderUserId)
    .maybeSingle<Pick<UserRow, "id" | "email">>();

  if (senderError) throw new Error(`Could not look up the account: ${senderError.message}`);
  if (!sender) throw new Error(`No user found with id ${params.senderUserId}.`);

  if (normaliseEmail(sender.email) === recipientEmail) {
    throw new Error(
      "A scheduled payment has to go to someone else. Please use a different email address, not your own.",
    );
  }

  const { data: inserted, error } = await supabase
    .from("scheduled_payments")
    .insert({
      sender_id: sender.id,
      recipient_email: recipientEmail,
      amount_usdc: amount,
      day_of_month: params.dayOfMonth,
      active: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !inserted) {
    throw new Error(`Could not save the schedule: ${error?.message ?? "no row returned"}`);
  }

  return {
    id: inserted.id,
    amount,
    recipientEmail,
    dayOfMonth: params.dayOfMonth,
    firstRun: nextRunDate(params.dayOfMonth, null),
  };
}

export async function listSchedules(userId: string): Promise<ScheduledPaymentRow[]> {
  const { data } = await getSupabaseAdmin()
    .from("scheduled_payments")
    .select(FIELDS)
    .eq("sender_id", userId)
    .order("day_of_month", { ascending: true });

  return (data ?? []) as ScheduledPaymentRow[];
}

export async function getSchedule(
  userId: string,
  id: string,
): Promise<ScheduledPaymentRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("scheduled_payments")
    .select(FIELDS)
    .eq("id", id)
    .eq("sender_id", userId)
    .maybeSingle<ScheduledPaymentRow>();

  return data ?? null;
}

/**
 * Pauses or resumes a schedule. Returns the updated row, or null when nothing
 * matched for this account.
 */
export async function setScheduleActive(
  userId: string,
  id: string,
  active: boolean,
): Promise<ScheduledPaymentRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("scheduled_payments")
    .update({ active })
    .eq("id", id)
    .eq("sender_id", userId)
    .select(FIELDS)
    .maybeSingle<ScheduledPaymentRow>();

  return data ?? null;
}

export async function deleteSchedule(userId: string, id: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("scheduled_payments")
    .delete()
    .eq("id", id)
    .eq("sender_id", userId)
    .select("id")
    .maybeSingle<{ id: string }>();

  return Boolean(data);
}

export type RunDetail = {
  id: string;
  recipient: string;
  amount: string;
  result: "sent" | "failed" | "skipped";
  reason?: string;
};

export type RunSummary = {
  day: number;
  due: number;
  sent: number;
  failed: number;
  skipped: number;
  details: RunDetail[];
};

/**
 * Runs every active schedule due today that has not already run this month.
 *
 * Each schedule is claimed with a conditional update before its send is created,
 * so a second run on the same day cannot pay it twice. The claim looks at the
 * calendar month of last_run_at, not just a date, so a run late in one month and
 * early in the next are told apart correctly. A schedule that fails has its claim
 * released and its owner emailed, and stays active to try again next month.
 */
export async function runScheduledPayments(now: Date = new Date()): Promise<RunSummary> {
  const supabase = getSupabaseAdmin();
  const day = now.getUTCDate();
  const monthStartIso = firstOfMonthUTC(now).toISOString();

  const summary: RunSummary = { day, due: 0, sent: 0, failed: 0, skipped: 0, details: [] };

  const { data: schedules } = await supabase
    .from("scheduled_payments")
    .select(FIELDS)
    .eq("active", true)
    .eq("day_of_month", day);

  const rows = (schedules ?? []) as ScheduledPaymentRow[];
  if (rows.length === 0) return summary;

  // Resolve owner emails once, for failure notices.
  const senderIds = [...new Set(rows.map((r) => r.sender_id).filter(Boolean))] as string[];
  const ownerEmail = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id, email").in("id", senderIds);
    for (const u of users ?? []) ownerEmail.set(u.id, u.email);
  }

  for (const schedule of rows) {
    const amount = toAmountString(schedule.amount_usdc);

    // Already ran this month, skip without touching anything.
    if (schedule.last_run_at && sameMonthUTC(new Date(schedule.last_run_at), now)) {
      summary.skipped += 1;
      summary.details.push({
        id: schedule.id,
        recipient: maskEmail(schedule.recipient_email),
        amount,
        result: "skipped",
        reason: "already ran this month",
      });
      continue;
    }

    summary.due += 1;

    // Claim it: only one run wins, even if the job fires twice.
    const { data: claimed } = await supabase
      .from("scheduled_payments")
      .update({ last_run_at: now.toISOString() })
      .eq("id", schedule.id)
      .eq("active", true)
      .or(`last_run_at.is.null,last_run_at.lt.${monthStartIso}`)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (!claimed) {
      summary.skipped += 1;
      summary.details.push({
        id: schedule.id,
        recipient: maskEmail(schedule.recipient_email),
        amount,
        result: "skipped",
        reason: "already claimed by another run",
      });
      continue;
    }

    try {
      if (!schedule.sender_id) throw new Error("The account for this schedule is missing.");
      await createSend({
        senderUserId: schedule.sender_id,
        recipientEmail: schedule.recipient_email,
        amountUsdc: amount,
      });

      await supabase
        .from("scheduled_payments")
        .update({ last_error: null, last_failed_at: null })
        .eq("id", schedule.id);

      summary.sent += 1;
      summary.details.push({
        id: schedule.id,
        recipient: maskEmail(schedule.recipient_email),
        amount,
        result: "sent",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Something went wrong.";

      // Release the claim so the schedule stays due, and record the failure.
      await supabase
        .from("scheduled_payments")
        .update({
          last_run_at: schedule.last_run_at,
          last_error: reason,
          last_failed_at: now.toISOString(),
        })
        .eq("id", schedule.id);

      const to = schedule.sender_id ? ownerEmail.get(schedule.sender_id) : undefined;
      if (to) {
        const { subject, html } = scheduleFailedEmail({
          amount,
          recipientLabel: maskEmail(schedule.recipient_email),
          dayLabel: ordinal(schedule.day_of_month),
          reason,
          markUrl: brandMarkUrl(),
        });
        await sendAndLog({ to, subject, html, type: "schedule_failed", transactionId: null });
      }

      summary.failed += 1;
      summary.details.push({
        id: schedule.id,
        recipient: maskEmail(schedule.recipient_email),
        amount,
        result: "failed",
        reason,
      });
    }
  }

  return summary;
}
