import type { TransactionStatus } from "../cue/types";

export function dollars(amount: string): string {
  return `$${amount}`;
}

export function humanizeSeconds(seconds: number): string {
  if (seconds <= 30) return "a moment";
  const minutes = Math.round(seconds / 60);
  if (minutes <= 1) return "about a minute";
  if (minutes < 55) return `about ${minutes} minutes`;
  if (minutes < 90) return "about an hour";
  const hours = Math.round(minutes / 60);
  return `about ${hours} hours`;
}

const STATUS: Record<TransactionStatus, string> = {
  pending_claim: "waiting to be collected",
  claimed: "collected",
  cancelled: "called back",
  failed: "did not go through",
};

export function statusPhrase(status: TransactionStatus): string {
  return STATUS[status];
}

const REQUEST_STATUS: Record<string, string> = {
  pending: "waiting to be paid",
  paid: "paid",
  cancelled: "cancelled",
  expired: "expired",
};

export function requestStatusPhrase(status: string): string {
  return REQUEST_STATUS[status] ?? status;
}
