/**
 * Formatting for tool output that Claude relays to a person. Money as dollars,
 * times as plain phrases, statuses in words. None of the words crypto, wallet,
 * blockchain or token ever appear here.
 */

import type { ActivityItem } from "./client.js";

export function dollars(amount: string): string {
  return `$${amount}`;
}

/**
 * A plain phrase for a duration, never a raw timestamp.
 */
export function humanizeSeconds(seconds: number): string {
  if (seconds <= 30) return "a moment";
  const minutes = Math.round(seconds / 60);
  if (minutes <= 1) return "about a minute";
  if (minutes < 55) return `about ${minutes} minutes`;
  if (minutes < 90) return "about an hour";
  const hours = Math.round(minutes / 60);
  return `about ${hours} hours`;
}

export function secondsUntil(deadlineIso: string): number {
  return Math.max(0, Math.ceil((new Date(deadlineIso).getTime() - Date.now()) / 1000));
}

const STATUS_PHRASE: Record<ActivityItem["status"], string> = {
  pending_claim: "waiting to be collected",
  claimed: "collected",
  cancelled: "called back",
  failed: "did not go through",
};

export function statusPhrase(status: ActivityItem["status"]): string {
  return STATUS_PHRASE[status];
}

const REQUEST_STATUS_PHRASE: Record<string, string> = {
  pending: "waiting to be paid",
  paid: "paid",
  cancelled: "cancelled",
  expired: "expired",
};

export function requestStatusPhrase(status: string): string {
  return REQUEST_STATUS_PHRASE[status] ?? status;
}

/**
 * Splits a total evenly into `parts` amount strings, giving any leftover cents
 * one at a time to the earliest recipients so nothing is lost. Kept in step with
 * the server helper of the same name.
 */
export function splitAmount(total: number, parts: number): string[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / parts);
  const remainder = cents - base * parts;
  const amounts: string[] = [];
  for (let i = 0; i < parts; i += 1) {
    const withExtra = base + (i < remainder ? 1 : 0);
    amounts.push((withExtra / 100).toFixed(2));
  }
  return amounts;
}
