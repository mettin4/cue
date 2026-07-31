import "server-only";

import {
  findLatestPendingSend,
  getSendStatus,
  resendClaimEmail,
} from "../cue/actions";
import { cancelSend as cancelSendCore } from "../cue/cancel";
import { DEFAULT_CANCEL_WINDOW_SECONDS, maxSendUsdc } from "../config";
import {
  listContacts as listContactsCore,
  resolveRecipient,
  saveContact as saveContactCore,
} from "../cue/contacts";
import { getDashboardData } from "../cue/dashboard";
import {
  getDebt,
  listDebts,
  sendDebtReminder,
  settleBySend,
  settleDebt,
  trackDebt,
} from "../cue/debts";
import { getLimits, getUsage, loosensLimits, setLimits } from "../cue/limits";
import { maskEmail, parseAmount, splitAmount, toAmountString } from "../cue/money";
import { createRequest, listRequests } from "../cue/requests";
import { getSpendingSummary, type SummaryPeriod } from "../cue/summary";
import {
  createSchedule,
  deleteSchedule,
  formatRunDate,
  getSchedule,
  listSchedules,
  nextRunDate,
  ordinal,
  setScheduleActive,
} from "../cue/schedules";
import { createSend } from "../cue/send";
import type { UserRow } from "../cue/types";
import { claimConfirmation, issueConfirmation, readConfirmation } from "./confirm";
import {
  dollars,
  humanizeSeconds,
  requestStatusPhrase,
  statusPhrase,
} from "./format";

export type ToolOut = {
  text: string;
  isError?: boolean;
  /** Optional structured data for an MCP Apps view, alongside the text fallback. */
  structuredContent?: Record<string, unknown>;
};

/**
 * Claims a confirmation token's jti so its action runs at most once. Returns an
 * error result when the token was already used, which the caller returns as is.
 * Call this only after the token's kind and account have been verified, so a
 * mismatched token never burns a jti.
 */
async function claimOnce(jti: string): Promise<ToolOut | null> {
  const fresh = await claimConfirmation(jti);
  return fresh
    ? null
    : {
        text: "That confirmation was already used, so nothing ran a second time. Ask me to prepare a new one if you meant to do it again.",
        isError: true,
      };
}

function secondsUntil(deadline: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 1000));
}

/**
 * Turns a recipient argument into an email, resolving contact names against the
 * account's own contacts. Returns an actionable message when it matches nothing
 * or more than one contact, so the caller never guesses an address.
 */
type Resolved = { email: string; label: string };

async function resolveOrExplain(
  userId: string,
  input: string,
): Promise<Resolved | { error: ToolOut }> {
  const resolution = await resolveRecipient(userId, input);

  if (resolution.kind === "email") {
    return { email: resolution.email, label: resolution.email };
  }
  if (resolution.kind === "contact") {
    return { email: resolution.email, label: `${resolution.name} (${resolution.email})` };
  }
  if (resolution.kind === "none") {
    return {
      error: {
        text: `I could not find a contact named "${resolution.query}". Add them with save_contact, or give me their email address.`,
        isError: true,
      },
    };
  }
  const names = resolution.matches.map((m) => m.name).join(", ");
  return {
    error: {
      text: `More than one contact matches "${resolution.query}": ${names}. Tell me which one, or give me the email address.`,
      isError: true,
    },
  };
}

/**
 * The acting user is always passed in, resolved from the connect token by the
 * route. It is never taken from tool arguments.
 */

export async function sendMoney(
  user: UserRow,
  args: { recipientEmail?: string; amount?: number; confirmationToken?: string },
): Promise<ToolOut> {
  if (args.confirmationToken) {
    const payload = readConfirmation(args.confirmationToken);
    if (!payload || payload.kind !== "send" || payload.userId !== user.id) {
      return {
        text: "That confirmation is not valid or has expired. Ask me to prepare the payment again.",
        isError: true,
      };
    }
    const used = await claimOnce(payload.jti);
    if (used) return used;
    try {
      const result = await createSend({
        senderUserId: user.id,
        recipientEmail: payload.recipientEmail,
        amountUsdc: payload.amount,
      });
      const unlock = humanizeSeconds(secondsUntil(result.cancelDeadline));
      return {
        text: `Sent ${dollars(payload.amount)} to ${payload.recipientEmail}. They can collect it in ${unlock}, and you can call it back until then.`,
        structuredContent: {
          kind: "send_success",
          amount: payload.amount,
          recipient: payload.recipientEmail,
          unlockLabel: unlock,
        },
      };
    } catch (error) {
      return { text: message(error), isError: true };
    }
  }

  if (!args.recipientEmail || args.amount == null) {
    return {
      text: "To send money I need the recipient email or a saved contact name, and the amount in dollars.",
      isError: true,
    };
  }

  const resolved = await resolveOrExplain(user.id, args.recipientEmail);
  if ("error" in resolved) return resolved.error;

  let amount: string;
  try {
    amount = parseAmount(args.amount);
  } catch (error) {
    return { text: message(error), isError: true };
  }

  const token = issueConfirmation({
    kind: "send",
    userId: user.id,
    recipientEmail: resolved.email,
    amount,
  });

  // The honest constraint on a send is the spending limit, not the account
  // balance: on testnet the money is covered from a shared pool, so a personal
  // balance is never debited. Show how much of the limit is left after this send,
  // and nothing when no limit is set.
  let limitLeft: string | undefined;
  let limitScope: string | undefined;
  try {
    const usage = await getUsage(user.id);
    const active = usage.daily
      ? { remaining: usage.daily.remaining, scope: "today" }
      : usage.monthly
        ? { remaining: usage.monthly.remaining, scope: "this month" }
        : null;
    if (active) {
      const after = Math.round(Number(active.remaining) * 100) - Math.round(Number(amount) * 100);
      limitLeft = (Math.max(0, after) / 100).toFixed(2);
      limitScope = active.scope;
    }
  } catch {
    // Leave it out rather than show a wrong number.
  }

  const unlockLabel = humanizeSeconds(DEFAULT_CANCEL_WINDOW_SECONDS);

  return {
    text:
      `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
      `Send ${dollars(amount)} to ${resolved.label}. They will have about an hour to collect it, and you can call it back during that time.\n` +
      `Once the user approves, call send_money again with confirmationToken "${token}".`,
    structuredContent: {
      kind: "send_preview",
      amount,
      recipient: resolved.label,
      unlockLabel,
      limitLeft,
      limitScope,
      confirmationToken: token,
    },
  };
}

export async function requestMoney(
  user: UserRow,
  args: { fromEmail?: string; amount?: number; confirmationToken?: string },
): Promise<ToolOut> {
  if (args.confirmationToken) {
    const payload = readConfirmation(args.confirmationToken);
    if (!payload || payload.kind !== "request" || payload.userId !== user.id) {
      return {
        text: "That confirmation is not valid or has expired. Ask me to prepare the request again.",
        isError: true,
      };
    }
    const used = await claimOnce(payload.jti);
    if (used) return used;
    try {
      await createRequest({
        requesterUserId: user.id,
        targetEmail: payload.targetEmail,
        amount: payload.amount,
      });
      return {
        text: `Requested ${dollars(payload.amount)} from ${payload.targetEmail}. I sent them a link to pay you. They are not charged unless they choose to pay.`,
      };
    } catch (error) {
      return { text: message(error), isError: true };
    }
  }

  if (!args.fromEmail || args.amount == null) {
    return {
      text: "To request money I need who to ask, by email or saved contact name, and the amount in dollars.",
      isError: true,
    };
  }

  const resolved = await resolveOrExplain(user.id, args.fromEmail);
  if ("error" in resolved) return resolved.error;

  let amount: string;
  try {
    amount = parseAmount(args.amount);
  } catch (error) {
    return { text: message(error), isError: true };
  }

  const token = issueConfirmation({
    kind: "request",
    userId: user.id,
    targetEmail: resolved.email,
    amount,
  });

  return {
    text:
      `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
      `Request ${dollars(amount)} from ${resolved.label}. They will get an email with a link to pay you, and nothing is charged unless they choose to pay.\n` +
      `Once the user approves, call request_money again with confirmationToken "${token}".`,
  };
}

export async function splitMoney(
  user: UserRow,
  args: { totalAmount?: number; recipients?: string[]; confirmationToken?: string },
): Promise<ToolOut> {
  if (args.confirmationToken) {
    const payload = readConfirmation(args.confirmationToken);
    if (!payload || payload.kind !== "split" || payload.userId !== user.id) {
      return {
        text: "That confirmation is not valid or has expired. Ask me to prepare the split again.",
        isError: true,
      };
    }
    const used = await claimOnce(payload.jti);
    if (used) return used;

    // Check the whole total against the balance before starting, so a split that
    // cannot complete does not send some shares and then stop.
    const total = payload.items.reduce(
      (sum, item) => sum + Math.round(Number(item.amount) * 100),
      0,
    );
    try {
      const data = await getDashboardData(user);
      if (Math.round(Number(data.balance) * 100) < total) {
        return {
          text: `Your balance is ${dollars(data.balance)}, which is not enough for the ${dollars(
            (total / 100).toFixed(2),
          )} total. Add money or split a smaller amount. Nothing was sent.`,
          isError: true,
        };
      }
    } catch (error) {
      return { text: message(error), isError: true };
    }

    const sent: { email: string; amount: string }[] = [];
    const failed: { email: string; amount: string; reason: string }[] = [];

    for (const item of payload.items) {
      try {
        await createSend({
          senderUserId: user.id,
          recipientEmail: item.email,
          amountUsdc: item.amount,
        });
        sent.push({ email: item.email, amount: item.amount });
      } catch (error) {
        failed.push({ email: item.email, amount: item.amount, reason: message(error) });
      }
    }

    const sentLines = sent
      .map((s) => `${dollars(s.amount)} to ${s.email}`)
      .join(", ");

    if (failed.length === 0) {
      return {
        text: `Split sent. ${sentLines}. Each person can collect their share within about an hour, and you can call any of them back until then.`,
      };
    }

    const failedLines = failed
      .map((f) => `${dollars(f.amount)} to ${f.email} (${f.reason})`)
      .join("; ");

    if (sent.length === 0) {
      return {
        text: `None of the split went through. Not sent: ${failedLines}. Nothing was charged.`,
        isError: true,
      };
    }

    return {
      text: `Part of the split went through. Sent: ${sentLines}. Not sent: ${failedLines}. The sends that went through were not undone, so only retry the ones that failed.`,
      isError: true,
    };
  }

  if (args.totalAmount == null || !args.recipients || args.recipients.length === 0) {
    return {
      text: "To split money I need the total amount in dollars and a list of recipients, by email or saved contact name.",
      isError: true,
    };
  }

  let total: string;
  try {
    total = parseAmount(args.totalAmount);
  } catch (error) {
    return { text: message(error), isError: true };
  }

  // Resolve every recipient first. If any cannot be resolved, stop and say which
  // ones, rather than sending to some and asking about the rest.
  const resolvedList: Resolved[] = [];
  const problems: string[] = [];
  for (const raw of args.recipients) {
    const resolved = await resolveOrExplain(user.id, raw);
    if ("error" in resolved) problems.push(resolved.error.text);
    else resolvedList.push(resolved);
  }
  if (problems.length > 0) {
    return {
      text: `I could not work out every recipient, so nothing was prepared:\n${problems.join("\n")}`,
      isError: true,
    };
  }

  const shares = splitAmount(total, resolvedList.length);
  const base = shares[shares.length - 1]; // the smallest share, before the extra cent

  // Each share is its own send, so the per send limit and the minimum apply to
  // each one.
  if (Number(base) < 0.01) {
    return {
      text: `${dollars(total)} is too small to split between ${resolvedList.length} people. Each share needs to be at least $0.01.`,
      isError: true,
    };
  }
  const cap = maxSendUsdc();
  const largest = shares.reduce((max, s) => (Number(s) > Number(max) ? s : max), "0");
  if (Number(largest) > cap) {
    return {
      text: `Each share would be about ${dollars(largest)}, which is more than the limit of ${cap.toFixed(
        2,
      )} dollars per send. Split a smaller total or add more people.`,
      isError: true,
    };
  }

  const items = resolvedList.map((r, i) => ({ email: r.email, label: r.label, amount: shares[i] }));
  const token = issueConfirmation({
    kind: "split",
    userId: user.id,
    items: items.map((i) => ({ email: i.email, amount: i.amount })),
  });

  const lines = items.map((i) => {
    const extra = i.amount !== base ? " (gets the extra cent)" : "";
    return `- ${i.label}: ${dollars(i.amount)}${extra}`;
  });

  return {
    text:
      `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
      `Split ${dollars(total)} between ${items.length} people:\n${lines.join("\n")}\n` +
      `That is ${dollars(total)} in total. Each is a separate send they can collect within about an hour, and you can call any of them back during that time.\n` +
      `Once the user approves, call split_money again with confirmationToken "${token}".`,
  };
}

export async function saveContact(
  user: UserRow,
  args: { name?: string; email?: string },
): Promise<ToolOut> {
  if (!args.name || !args.email) {
    return {
      text: "To save a contact I need a name and an email address.",
      isError: true,
    };
  }
  try {
    const contact = await saveContactCore(user.id, args.name, args.email);
    return {
      text: `Saved ${contact.name} (${contact.email}) to your contacts. You can now say things like send ${dollars(
        "5.00",
      )} to ${contact.name}.`,
    };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function listContacts(user: UserRow): Promise<ToolOut> {
  try {
    const contacts = await listContactsCore(user.id);
    if (contacts.length === 0) {
      return {
        text: "You have not saved any contacts yet. Save one with save_contact, for example the name Alex and their email address.",
      };
    }
    const lines = contacts.map((c) => `- ${c.name}: ${c.email}`);
    return { text: `Your contacts:\n${lines.join("\n")}` };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function schedulePayment(
  user: UserRow,
  args: { recipient?: string; amount?: number; dayOfMonth?: number; confirmationToken?: string },
): Promise<ToolOut> {
  if (args.confirmationToken) {
    const payload = readConfirmation(args.confirmationToken);
    if (!payload || payload.kind !== "schedule" || payload.userId !== user.id) {
      return {
        text: "That confirmation is not valid or has expired. Ask me to prepare the schedule again.",
        isError: true,
      };
    }
    const used = await claimOnce(payload.jti);
    if (used) return used;
    try {
      const result = await createSchedule({
        senderUserId: user.id,
        recipientEmail: payload.recipientEmail,
        amount: payload.amount,
        dayOfMonth: payload.dayOfMonth,
      });
      return {
        text: `Scheduled ${dollars(result.amount)} to ${payload.recipientEmail} on the ${ordinal(
          result.dayOfMonth,
        )} of each month. The first payment goes out on ${formatRunDate(result.firstRun)}.`,
      };
    } catch (error) {
      return { text: message(error), isError: true };
    }
  }

  if (!args.recipient || args.amount == null || args.dayOfMonth == null) {
    return {
      text: "To schedule a payment I need who to pay, by email or saved contact name, the amount in dollars, and a day of the month between 1 and 28.",
      isError: true,
    };
  }

  if (!Number.isInteger(args.dayOfMonth) || args.dayOfMonth < 1 || args.dayOfMonth > 28) {
    return {
      text: "Pick a day of the month between 1 and 28, so the payment has that day every month.",
      isError: true,
    };
  }

  const resolved = await resolveOrExplain(user.id, args.recipient);
  if ("error" in resolved) return resolved.error;

  let amount: string;
  try {
    amount = parseAmount(args.amount);
  } catch (error) {
    return { text: message(error), isError: true };
  }

  const firstRun = nextRunDate(args.dayOfMonth, null);
  const token = issueConfirmation({
    kind: "schedule",
    userId: user.id,
    recipientEmail: resolved.email,
    amount,
    dayOfMonth: args.dayOfMonth,
  });

  return {
    text:
      `Preview, nothing has been scheduled yet. Show this to the user and wait for their approval:\n` +
      `Set up ${dollars(amount)} to ${resolved.label} on the ${ordinal(args.dayOfMonth)} of every month. ` +
      `The first payment goes out on ${formatRunDate(firstRun)}, and it repeats on the ${ordinal(
        args.dayOfMonth,
      )} each month until it is paused or deleted.\n` +
      `Once the user approves, call schedule_payment again with confirmationToken "${token}".`,
  };
}

export async function manageSchedules(
  user: UserRow,
  args: { action?: "list" | "pause" | "resume" | "delete"; scheduleId?: string; confirmationToken?: string },
): Promise<ToolOut> {
  if (args.confirmationToken) {
    const payload = readConfirmation(args.confirmationToken);
    if (!payload || payload.kind !== "schedule_delete" || payload.userId !== user.id) {
      return {
        text: "That confirmation is not valid or has expired. Ask me to prepare the deletion again.",
        isError: true,
      };
    }
    const used = await claimOnce(payload.jti);
    if (used) return used;
    const removed = await deleteSchedule(user.id, payload.scheduleId);
    if (!removed) {
      return { text: "That schedule was already removed, so there was nothing to delete." };
    }
    return {
      text: `Deleted the scheduled payment of ${dollars(payload.amount)} to ${payload.recipient}. It will not run again.`,
    };
  }

  const action = args.action ?? "list";

  try {
    if (action === "list") {
      const schedules = await listSchedules(user.id);
      if (schedules.length === 0) {
        return {
          text: "You have no scheduled payments. Set one up with schedule_payment.",
        };
      }
      const lines = schedules.map((s) => {
        const next = formatRunDate(nextRunDate(s.day_of_month, s.last_run_at));
        const state = s.active ? `next on ${next}` : "paused";
        return `- ${dollars(toAmountString(s.amount_usdc))} to ${maskEmail(s.recipient_email)} on the ${ordinal(
          s.day_of_month,
        )} of each month, ${state}. Reference ${s.id}.`;
      });
      return { text: `Your scheduled payments:\n${lines.join("\n")}` };
    }

    if (!args.scheduleId) {
      return {
        text: `To ${action} a scheduled payment, tell me which one using its reference from the list.`,
        isError: true,
      };
    }

    if (action === "pause") {
      const updated = await setScheduleActive(user.id, args.scheduleId, false);
      if (!updated) return { text: "I could not find that schedule for this account.", isError: true };
      return {
        text: `Paused the ${dollars(toAmountString(updated.amount_usdc))} payment to ${maskEmail(
          updated.recipient_email,
        )}. It will not run until you resume it.`,
      };
    }

    if (action === "resume") {
      const updated = await setScheduleActive(user.id, args.scheduleId, true);
      if (!updated) return { text: "I could not find that schedule for this account.", isError: true };
      return {
        text: `Resumed the ${dollars(toAmountString(updated.amount_usdc))} payment to ${maskEmail(
          updated.recipient_email,
        )} on the ${ordinal(updated.day_of_month)} of each month.`,
      };
    }

    // delete: needs confirmation.
    const schedule = await getSchedule(user.id, args.scheduleId);
    if (!schedule) return { text: "I could not find that schedule for this account.", isError: true };

    const amount = toAmountString(schedule.amount_usdc);
    const recipient = maskEmail(schedule.recipient_email);
    const token = issueConfirmation({
      kind: "schedule_delete",
      userId: user.id,
      scheduleId: schedule.id,
      amount,
      recipient,
    });
    return {
      text:
        `Preview, nothing has been deleted yet. Show this to the user and wait for their approval:\n` +
        `Delete the scheduled payment of ${dollars(amount)} to ${recipient} on the ${ordinal(
          schedule.day_of_month,
        )} of each month. This cannot be undone, but you can set it up again later.\n` +
        `Once the user approves, call manage_schedules again with confirmationToken "${token}".`,
    };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function cancelSend(
  user: UserRow,
  args: { transactionId?: string; recipientEmail?: string; confirmationToken?: string },
): Promise<ToolOut> {
  if (args.confirmationToken) {
    const payload = readConfirmation(args.confirmationToken);
    if (!payload || payload.kind !== "cancel" || payload.userId !== user.id) {
      return {
        text: "That confirmation is not valid or has expired. Ask me to prepare the call back again.",
        isError: true,
      };
    }
    const used = await claimOnce(payload.jti);
    if (used) return used;
    try {
      await cancelSendCore({
        transactionId: payload.transactionId,
        senderUserId: user.id,
      });
      return {
        text: `Called back ${dollars(payload.amount)} that was sent to ${payload.recipient}. They can no longer collect it.`,
      };
    } catch (error) {
      return { text: message(error), isError: true };
    }
  }

  try {
    let target: { transactionId: string; amount: string; recipient: string };

    if (args.transactionId) {
      const status = await getSendStatus(args.transactionId, user.id);
      if (!status) {
        return { text: "I could not find that send for this account.", isError: true };
      }
      if (status.status !== "pending_claim") {
        return {
          text:
            status.status === "claimed"
              ? "That money has already been collected, so it can no longer be called back."
              : "That send is not active, so there is nothing to call back.",
          isError: true,
        };
      }
      target = {
        transactionId: status.transactionId,
        amount: status.amount,
        recipient: status.recipient,
      };
    } else if (args.recipientEmail) {
      const match = await findLatestPendingSend(user.id, args.recipientEmail);
      if (!match) {
        return {
          text: `I could not find an uncollected send to ${args.recipientEmail} to call back.`,
          isError: true,
        };
      }
      target = {
        transactionId: match.transactionId,
        amount: match.amount,
        recipient: match.recipient,
      };
    } else {
      return {
        text: "To call a send back, tell me the recipient email or the send reference.",
        isError: true,
      };
    }

    const token = issueConfirmation({ kind: "cancel", userId: user.id, ...target });
    return {
      text:
        `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
        `Call back ${dollars(target.amount)} that was sent to ${target.recipient}. They have not collected it yet.\n` +
        `Once the user approves, call cancel_send again with confirmationToken "${token}".`,
    };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function getBalance(user: UserRow): Promise<ToolOut> {
  try {
    const data = await getDashboardData(user);
    const usage = await getUsage(user.id);

    let text = `Your balance is ${dollars(data.balance)}. In total you have sent ${dollars(
      data.stats.totalSent,
    )} and received ${dollars(data.stats.totalReceived)}, with ${data.stats.pendingCount} send${
      data.stats.pendingCount === 1 ? "" : "s"
    } waiting to be collected.`;

    if (usage.daily) {
      text += ` Your daily limit is ${dollars(usage.daily.limit)}, with ${dollars(
        usage.daily.remaining,
      )} left today.`;
    }
    if (usage.monthly) {
      text += ` Your monthly limit is ${dollars(usage.monthly.limit)}, with ${dollars(
        usage.monthly.remaining,
      )} left this month.`;
    }
    if (!usage.daily && !usage.monthly) {
      text += " No spending limits are set.";
    }

    return {
      text,
      structuredContent: {
        kind: "balance",
        balance: data.balance,
        totalSent: data.stats.totalSent,
        totalReceived: data.stats.totalReceived,
        pendingCount: data.stats.pendingCount,
        daily: usage.daily ? { limit: usage.daily.limit, remaining: usage.daily.remaining } : undefined,
        monthly: usage.monthly ? { limit: usage.monthly.limit, remaining: usage.monthly.remaining } : undefined,
        activity: data.activity.slice(0, 5).map((a) => ({
          amount: a.amount,
          direction: a.direction,
          counterparty: a.counterparty,
          status: a.status,
        })),
      },
    };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function getSpendingSummaryTool(
  user: UserRow,
  args: { period?: SummaryPeriod; from?: string; to?: string },
): Promise<ToolOut> {
  try {
    if (args.period === "custom" && (!args.from || !args.to)) {
      return {
        text: "For a custom period I need both a start and end date, each as YYYY-MM-DD.",
        isError: true,
      };
    }

    const s = await getSpendingSummary(user, {
      period: args.period ?? "this_month",
      from: args.from,
      to: args.to,
    });

    if (s.transfers === 0) {
      const received =
        Number(s.totalReceived) > 0
          ? ` You received ${dollars(s.totalReceived)}.`
          : "";
      return { text: `You have not sent anything ${s.periodLabel}.${received}` };
    }

    const plural = s.transfers === 1 ? "transfer" : "transfers";
    let text = `${capitalize(s.periodLabel)} you sent ${dollars(s.totalSent)} across ${s.transfers} ${plural}`;

    if (s.top.length > 0) {
      const lead = s.top[0];
      text += `, mostly to ${lead.label} who received ${dollars(lead.amount)} of it (${lead.share}%)`;
      if (s.top.length > 1) {
        const rest = s.top.slice(1).map((t) => `${t.label} ${dollars(t.amount)}`).join(", ");
        text += `. Then ${rest}`;
      }
    }
    text += ".";

    if (Number(s.totalReceived) > 0) {
      text += ` You received ${dollars(s.totalReceived)} over the same time.`;
    }

    return { text };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function setSpendingLimit(
  user: UserRow,
  args: { daily?: number | null; monthly?: number | null; confirmationToken?: string },
): Promise<ToolOut> {
  if (args.confirmationToken) {
    const payload = readConfirmation(args.confirmationToken);
    if (!payload || payload.kind !== "set_limit" || payload.userId !== user.id) {
      return {
        text: "That confirmation is not valid or has expired. Ask me to prepare the limit change again.",
        isError: true,
      };
    }
    const used = await claimOnce(payload.jti);
    if (used) return used;
    try {
      const limits = await setLimits(user.id, { daily: payload.daily, monthly: payload.monthly });
      return { text: describeLimits(limits) };
    } catch (error) {
      return { text: message(error), isError: true };
    }
  }

  if (args.daily === undefined && args.monthly === undefined) {
    return {
      text: "Tell me a daily limit, a monthly limit, or both. Use 0 or none to remove a limit.",
      isError: true,
    };
  }

  // Normalise: a client may pass 0 to mean remove.
  const next = {
    daily: args.daily === undefined ? undefined : args.daily && args.daily > 0 ? args.daily : null,
    monthly: args.monthly === undefined ? undefined : args.monthly && args.monthly > 0 ? args.monthly : null,
  };

  const current = await getLimits(user.id);

  // Loosening a safety control gets the same friction as sending money.
  if (loosensLimits(current, next)) {
    const token = issueConfirmation({
      kind: "set_limit",
      userId: user.id,
      daily: next.daily,
      monthly: next.monthly,
    });
    return {
      text:
        `Preview, the limit has not changed yet. This loosens a safety control, so show it to the user and wait for their approval:\n` +
        `${describeProposed(current, next)}\n` +
        `Once the user approves, call set_spending_limit again with confirmationToken "${token}".`,
    };
  }

  // Tightening or setting a first limit applies immediately.
  try {
    const limits = await setLimits(user.id, next);
    return { text: describeLimits(limits) };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function trackDebtTool(
  user: UserRow,
  args: { counterparty?: string; amount?: number; direction?: "they_owe" | "i_owe"; note?: string },
): Promise<ToolOut> {
  if (!args.counterparty || args.amount == null || !args.direction) {
    return {
      text: "To track a debt I need who it is with, the amount in dollars, and the direction: they owe you, or you owe them.",
      isError: true,
    };
  }
  try {
    const { debt, label } = await trackDebt({
      userId: user.id,
      counterparty: args.counterparty,
      amount: args.amount,
      direction: args.direction,
      note: args.note,
    });
    const amount = toAmountString(debt.amount);
    const about = debt.note ? ` for ${debt.note}` : "";
    return debt.direction === "they_owe"
      ? { text: `Noted that ${label} owes you ${dollars(amount)}${about}.` }
      : { text: `Noted that you owe ${label} ${dollars(amount)}${about}.` };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function listDebtsTool(user: UserRow): Promise<ToolOut> {
  try {
    const people = await listDebts(user.id);
    if (people.length === 0) return { text: "You have no open debts tracked." };

    const lines = people.map((p) => {
      const net =
        p.net > 0
          ? `${p.label} owes you ${dollars(p.net.toFixed(2))} net`
          : p.net < 0
            ? `you owe ${p.label} ${dollars(Math.abs(p.net).toFixed(2))} net`
            : `you and ${p.label} are even`;
      const items = p.items
        .map((i) => {
          const about = i.note ? ` (${i.note})` : "";
          const dir = i.direction === "they_owe" ? "they owe" : "you owe";
          return `${dir} ${dollars(i.amount)}${about} [${i.id}]`;
        })
        .join("; ");
      return `- ${net}. ${items}`;
    });

    return { text: `Open debts:\n${lines.join("\n")}` };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function settleDebtTool(
  user: UserRow,
  args: { debtId?: string; pay?: boolean; confirmationToken?: string },
): Promise<ToolOut> {
  if (args.confirmationToken) {
    const payload = readConfirmation(args.confirmationToken);
    if (!payload || payload.kind !== "settle_send" || payload.userId !== user.id) {
      return {
        text: "That confirmation is not valid or has expired. Ask me to prepare the payment again.",
        isError: true,
      };
    }
    const used = await claimOnce(payload.jti);
    if (used) return used;
    try {
      const done = await settleBySend(user, payload.debtId);
      return {
        text: `Sent ${dollars(done.amount)} to ${done.label} and marked the debt settled. They can collect it within about an hour.`,
      };
    } catch (error) {
      return { text: message(error), isError: true };
    }
  }

  if (!args.debtId) {
    return { text: "Tell me which debt to settle using its reference from list_debts.", isError: true };
  }

  const debt = await getDebt(user.id, args.debtId);
  if (!debt) return { text: "I could not find that debt for this account.", isError: true };
  if (debt.status === "settled") return { text: "That debt is already settled." };

  const amount = toAmountString(debt.amount);
  const label = debt.counterparty_name ?? (debt.counterparty_email ? maskEmail(debt.counterparty_email) : "them");

  // Settle by sending, only when you are the one who owes.
  if (args.pay) {
    if (debt.direction !== "i_owe") {
      return {
        text: "This is money owed to you, so there is nothing to send. Mark it settled without paying once they pay you.",
        isError: true,
      };
    }
    if (!debt.counterparty_email) {
      return {
        text: "This debt has no email on file, so it cannot be settled by sending. Save the person as a contact with their email, or settle it without sending.",
        isError: true,
      };
    }
    const token = issueConfirmation({
      kind: "settle_send",
      userId: user.id,
      debtId: debt.id,
      recipientEmail: debt.counterparty_email,
      amount,
    });
    return {
      text:
        `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
        `Settle by sending ${dollars(amount)} to ${label}. They will have about an hour to collect it, and the debt is marked settled once it goes out.\n` +
        `Once the user approves, call settle_debt again with confirmationToken "${token}".`,
    };
  }

  // Plain settle: just mark it, no money moves.
  const settled = await settleDebt(user.id, debt.id);
  if (!settled) return { text: "That debt was already settled." };
  return { text: `Marked the ${dollars(amount)} with ${label} as settled. No money was moved.` };
}

export async function remindDebtTool(
  user: UserRow,
  args: { debtId?: string },
): Promise<ToolOut> {
  if (!args.debtId) {
    return { text: "Tell me which debt to send a reminder for, using its reference from list_debts.", isError: true };
  }
  try {
    const { label, amount } = await sendDebtReminder(user, args.debtId);
    return { text: `Sent a friendly reminder to ${label} about the ${dollars(amount)} they owe you.` };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeLimits(limits: { daily: string | null; monthly: string | null }): string {
  const parts: string[] = [];
  parts.push(limits.daily ? `a daily limit of ${dollars(limits.daily)}` : "no daily limit");
  parts.push(limits.monthly ? `a monthly limit of ${dollars(limits.monthly)}` : "no monthly limit");
  return `Done. You now have ${parts[0]} and ${parts[1]}.`;
}

function describeField(name: string, cur: string | null, proposed: number | null | undefined): string | null {
  if (proposed === undefined) return null;
  if (proposed === null) return `remove your ${name} limit${cur ? ` of ${dollars(cur)}` : ""}`;
  const target = dollars(proposed.toFixed(2));
  return cur
    ? `raise your ${name} limit from ${dollars(cur)} to ${target}`
    : `set your ${name} limit to ${target}`;
}

function describeProposed(
  current: { daily: string | null; monthly: string | null },
  next: { daily?: number | null; monthly?: number | null },
): string {
  const parts = [
    describeField("daily", current.daily, next.daily),
    describeField("monthly", current.monthly, next.monthly),
  ].filter(Boolean);
  return `This will ${parts.join(" and ")}.`;
}

export async function getHistory(
  user: UserRow,
  args: { limit?: number; direction?: "in" | "out"; type?: "payments" | "requests" },
): Promise<ToolOut> {
  try {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);

    if (args.type === "requests") {
      const items = (await listRequests(user, { direction: args.direction, limit }))
        .slice(0, limit);
      if (items.length === 0) return { text: "There are no money requests yet." };

      const lines = items.map((item) =>
        item.direction === "out"
          ? `Requested ${dollars(item.amount)} from ${item.counterparty}, ${requestStatusPhrase(item.status)}.`
          : `${item.counterparty} requested ${dollars(item.amount)} from you, ${requestStatusPhrase(item.status)}.`,
      );
      return { text: `Money requests:\n${lines.join("\n")}` };
    }

    const data = await getDashboardData(user);
    const items = data.activity
      .filter((item) => !args.direction || item.direction === args.direction)
      .slice(0, limit);

    if (items.length === 0) return { text: "There is no activity yet." };

    const lines = items.map((item) => {
      const unlock =
        item.status === "pending_claim" && item.secondsUntilUnlock > 0
          ? `, unlocks in ${humanizeSeconds(item.secondsUntilUnlock)}`
          : "";
      return item.direction === "out"
        ? `Sent ${dollars(item.amount)} to ${item.counterparty}, ${statusPhrase(item.status)}${unlock}.`
        : `Received ${dollars(item.amount)} from ${item.counterparty}, ${statusPhrase(item.status)}.`;
    });

    return { text: `Recent activity:\n${lines.join("\n")}` };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function checkClaimStatus(
  user: UserRow,
  args: { transactionId: string },
): Promise<ToolOut> {
  try {
    const s = await getSendStatus(args.transactionId, user.id);
    if (!s) return { text: "I could not find that send for this account.", isError: true };

    if (s.status === "claimed") {
      return { text: `The ${dollars(s.amount)} sent to ${s.recipient} has been collected.` };
    }
    if (s.status === "cancelled") {
      return { text: `The ${dollars(s.amount)} sent to ${s.recipient} was called back.` };
    }
    if (s.status === "failed") {
      return { text: `That send to ${s.recipient} did not go through.` };
    }
    if (s.secondsUntilUnlock > 0) {
      return {
        text: `The ${dollars(s.amount)} sent to ${s.recipient} has not been collected yet. It unlocks in ${humanizeSeconds(
          s.secondsUntilUnlock,
        )}, and you can call it back until then.`,
      };
    }
    return {
      text: `The ${dollars(s.amount)} sent to ${s.recipient} has not been collected yet. It is now available for them to collect.`,
    };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

export async function resendClaimLink(
  user: UserRow,
  args: { transactionId: string },
): Promise<ToolOut> {
  try {
    const result = await resendClaimEmail(args.transactionId, user);
    if (!result.ok) {
      return { text: "I could not send the collection email right now.", isError: true };
    }
    return { text: `Sent the collection email again to ${result.recipient}.` };
  } catch (error) {
    return { text: message(error), isError: true };
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
