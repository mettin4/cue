/**
 * Tool implementations, kept separate from the MCP wiring so the test CLI can
 * call them directly.
 *
 * Confirmation model: Claude Desktop's support for MCP elicitation is optional
 * and still evolving, so send_money and cancel_send use a two call pattern that
 * works everywhere. The first call returns a preview and a confirmation token
 * and moves no money. A second call with that token executes. The pending
 * previews live in memory for the life of this process, which is the session.
 */

import { randomBytes } from "node:crypto";

import { CueClient, CueError } from "./client.js";
import {
  dollars,
  formatRunDate,
  humanizeSeconds,
  nextRunDate,
  ordinal,
  requestStatusPhrase,
  secondsUntil,
  splitAmount,
  statusPhrase,
} from "./format.js";

type PendingSend = { kind: "send"; recipientEmail: string; amount: string };
type PendingCancel = {
  kind: "cancel";
  transactionId: string;
  amount: string;
  recipient: string;
};
type PendingRequest = { kind: "request"; targetEmail: string; amount: string };
type PendingSplit = {
  kind: "split";
  items: { email: string; amount: string }[];
};
type PendingSchedule = {
  kind: "schedule";
  recipientEmail: string;
  amount: string;
  dayOfMonth: number;
};
type PendingScheduleDelete = {
  kind: "schedule_delete";
  scheduleId: string;
  amount: string;
  recipient: string;
};
type PendingSetLimit = {
  kind: "set_limit";
  daily: number | null | undefined;
  monthly: number | null | undefined;
};
type PendingSettleSend = {
  kind: "settle_send";
  debtId: string;
  amount: string;
  label: string;
};

export type Ctx = {
  client: CueClient;
  pending: Map<
    string,
    | PendingSend
    | PendingCancel
    | PendingRequest
    | PendingSplit
    | PendingSchedule
    | PendingScheduleDelete
    | PendingSetLimit
    | PendingSettleSend
  >;
};

export type ToolResult = { text: string; isError?: boolean };

export function newContext(client: CueClient): Ctx {
  return { client, pending: new Map() };
}

function token(): string {
  return randomBytes(3).toString("hex");
}

function fail(error: unknown): ToolResult {
  if (error instanceof CueError) return { text: error.message, isError: true };
  return { text: "Something went wrong. Please try again.", isError: true };
}

const MAX_SEND = 5;

/**
 * Turns a recipient argument into an email, resolving contact names against the
 * account's own contacts. Mirrors the server helper: an at sign means an email,
 * otherwise an exact then a single partial name match wins, and anything else
 * comes back as a message to show rather than a guessed address.
 */
type Resolved = { email: string; label: string };

async function resolveOrExplain(
  ctx: Ctx,
  input: string,
): Promise<Resolved | { error: ToolResult }> {
  const value = input.trim();
  if (value.includes("@")) return { email: value.toLowerCase(), label: value.toLowerCase() };

  const contacts = await ctx.client.listContacts();
  const lower = value.toLowerCase();

  const exact = contacts.filter((c) => c.name.toLowerCase() === lower);
  const matches = exact.length > 0
    ? exact
    : contacts.filter((c) => c.name.toLowerCase().includes(lower));

  if (matches.length === 1) {
    return { email: matches[0].email, label: `${matches[0].name} (${matches[0].email})` };
  }
  if (matches.length === 0) {
    return {
      error: {
        text: `I could not find a contact named "${value}". Add them with save_contact, or give me their email address.`,
        isError: true,
      },
    };
  }
  const names = matches.map((m) => m.name).join(", ");
  return {
    error: {
      text: `More than one contact matches "${value}": ${names}. Tell me which one, or give me the email address.`,
      isError: true,
    },
  };
}

export async function sendMoney(
  ctx: Ctx,
  args: { recipientEmail?: string; amount?: number; confirmationToken?: string },
): Promise<ToolResult> {
  if (args.confirmationToken) {
    const pending = ctx.pending.get(args.confirmationToken);
    if (!pending || pending.kind !== "send") {
      return {
        text: "That confirmation code is not valid or has expired. Ask me to prepare the payment again.",
        isError: true,
      };
    }
    ctx.pending.delete(args.confirmationToken);
    try {
      const result = await ctx.client.send({
        recipientEmail: pending.recipientEmail,
        amountUsdc: pending.amount,
      });
      const unlock = humanizeSeconds(secondsUntil(result.cancelDeadline));
      return {
        text: `Sent ${dollars(pending.amount)} to ${pending.recipientEmail}. They can collect it in ${unlock}, and you can call it back until then.`,
      };
    } catch (error) {
      return fail(error);
    }
  }

  if (!args.recipientEmail || args.amount == null) {
    return {
      text: "To send money I need the recipient email or a saved contact name, and the amount in dollars.",
      isError: true,
    };
  }
  if (!(args.amount > 0)) {
    return { text: "The amount must be greater than zero. Enter something like 5.00.", isError: true };
  }

  const resolved = await resolveOrExplain(ctx, args.recipientEmail);
  if ("error" in resolved) return resolved.error;

  const amount = args.amount.toFixed(2);
  const code = token();
  ctx.pending.set(code, { kind: "send", recipientEmail: resolved.email, amount });

  return {
    text:
      `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
      `Send ${dollars(amount)} to ${resolved.label}. They will have about an hour to collect it, and you can call it back during that time.\n` +
      `Once the user approves, call send_money again with confirmationToken "${code}".`,
  };
}

export async function requestMoney(
  ctx: Ctx,
  args: { fromEmail?: string; amount?: number; confirmationToken?: string },
): Promise<ToolResult> {
  if (args.confirmationToken) {
    const pending = ctx.pending.get(args.confirmationToken);
    if (!pending || pending.kind !== "request") {
      return {
        text: "That confirmation code is not valid or has expired. Ask me to prepare the request again.",
        isError: true,
      };
    }
    ctx.pending.delete(args.confirmationToken);
    try {
      await ctx.client.createRequest({
        targetEmail: pending.targetEmail,
        amount: pending.amount,
      });
      return {
        text: `Requested ${dollars(pending.amount)} from ${pending.targetEmail}. I sent them a link to pay you. They are not charged unless they choose to pay.`,
      };
    } catch (error) {
      return fail(error);
    }
  }

  if (!args.fromEmail || args.amount == null) {
    return {
      text: "To request money I need who to ask, by email or saved contact name, and the amount in dollars.",
      isError: true,
    };
  }
  if (!(args.amount > 0)) {
    return { text: "The amount must be greater than zero. Enter something like 5.00.", isError: true };
  }

  const resolved = await resolveOrExplain(ctx, args.fromEmail);
  if ("error" in resolved) return resolved.error;

  const amount = args.amount.toFixed(2);
  const code = token();
  ctx.pending.set(code, { kind: "request", targetEmail: resolved.email, amount });

  return {
    text:
      `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
      `Request ${dollars(amount)} from ${resolved.label}. They will get an email with a link to pay you, and nothing is charged unless they choose to pay.\n` +
      `Once the user approves, call request_money again with confirmationToken "${code}".`,
  };
}

export async function splitMoney(
  ctx: Ctx,
  args: { totalAmount?: number; recipients?: string[]; confirmationToken?: string },
): Promise<ToolResult> {
  if (args.confirmationToken) {
    const pending = ctx.pending.get(args.confirmationToken);
    if (!pending || pending.kind !== "split") {
      return {
        text: "That confirmation code is not valid or has expired. Ask me to prepare the split again.",
        isError: true,
      };
    }
    ctx.pending.delete(args.confirmationToken);

    const sent: { email: string; amount: string }[] = [];
    const failed: { email: string; amount: string; reason: string }[] = [];
    for (const item of pending.items) {
      try {
        await ctx.client.send({ recipientEmail: item.email, amountUsdc: item.amount });
        sent.push(item);
      } catch (error) {
        const reason = error instanceof CueError ? error.message : "could not be sent";
        failed.push({ ...item, reason });
      }
    }

    const sentLines = sent.map((s) => `${dollars(s.amount)} to ${s.email}`).join(", ");
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
  if (!(args.totalAmount > 0)) {
    return { text: "The total must be greater than zero. Enter something like 30.00.", isError: true };
  }

  const resolvedList: Resolved[] = [];
  const problems: string[] = [];
  for (const raw of args.recipients) {
    const resolved = await resolveOrExplain(ctx, raw);
    if ("error" in resolved) problems.push(resolved.error.text);
    else resolvedList.push(resolved);
  }
  if (problems.length > 0) {
    return {
      text: `I could not work out every recipient, so nothing was prepared:\n${problems.join("\n")}`,
      isError: true,
    };
  }

  const shares = splitAmount(args.totalAmount, resolvedList.length);
  const base = shares[shares.length - 1];
  if (Number(base) < 0.01) {
    return {
      text: `${dollars(args.totalAmount.toFixed(2))} is too small to split between ${resolvedList.length} people. Each share needs to be at least $0.01.`,
      isError: true,
    };
  }
  const largest = shares.reduce((max, s) => (Number(s) > Number(max) ? s : max), "0");
  if (Number(largest) > MAX_SEND) {
    return {
      text: `Each share would be about ${dollars(largest)}, which is more than the limit of ${MAX_SEND.toFixed(
        2,
      )} dollars per send. Split a smaller total or add more people.`,
      isError: true,
    };
  }

  const items = resolvedList.map((r, i) => ({ email: r.email, label: r.label, amount: shares[i] }));
  const code = token();
  ctx.pending.set(code, { kind: "split", items: items.map((i) => ({ email: i.email, amount: i.amount })) });

  const lines = items.map((i) => {
    const extra = i.amount !== base ? " (gets the extra cent)" : "";
    return `- ${i.label}: ${dollars(i.amount)}${extra}`;
  });

  return {
    text:
      `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
      `Split ${dollars(args.totalAmount.toFixed(2))} between ${items.length} people:\n${lines.join("\n")}\n` +
      `That is ${dollars(args.totalAmount.toFixed(2))} in total. Each is a separate send they can collect within about an hour, and you can call any of them back during that time.\n` +
      `Once the user approves, call split_money again with confirmationToken "${code}".`,
  };
}

export async function saveContact(
  ctx: Ctx,
  args: { name?: string; email?: string },
): Promise<ToolResult> {
  if (!args.name || !args.email) {
    return { text: "To save a contact I need a name and an email address.", isError: true };
  }
  try {
    const contact = await ctx.client.saveContact({ name: args.name, email: args.email });
    return {
      text: `Saved ${contact.name} (${contact.email}) to your contacts. You can now say things like send ${dollars(
        "5.00",
      )} to ${contact.name}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function listContacts(ctx: Ctx): Promise<ToolResult> {
  try {
    const contacts = await ctx.client.listContacts();
    if (contacts.length === 0) {
      return {
        text: "You have not saved any contacts yet. Save one with save_contact, for example the name Alex and their email address.",
      };
    }
    const lines = contacts.map((c) => `- ${c.name}: ${c.email}`);
    return { text: `Your contacts:\n${lines.join("\n")}` };
  } catch (error) {
    return fail(error);
  }
}

export async function schedulePayment(
  ctx: Ctx,
  args: { recipient?: string; amount?: number; dayOfMonth?: number; confirmationToken?: string },
): Promise<ToolResult> {
  if (args.confirmationToken) {
    const pending = ctx.pending.get(args.confirmationToken);
    if (!pending || pending.kind !== "schedule") {
      return {
        text: "That confirmation code is not valid or has expired. Ask me to prepare the schedule again.",
        isError: true,
      };
    }
    ctx.pending.delete(args.confirmationToken);
    try {
      const result = await ctx.client.createSchedule({
        recipientEmail: pending.recipientEmail,
        amount: pending.amount,
        dayOfMonth: pending.dayOfMonth,
      });
      return {
        text: `Scheduled ${dollars(pending.amount)} to ${pending.recipientEmail} on the ${ordinal(
          pending.dayOfMonth,
        )} of each month. The first payment goes out on ${formatRunDate(new Date(result.firstRun))}.`,
      };
    } catch (error) {
      return fail(error);
    }
  }

  if (!args.recipient || args.amount == null || args.dayOfMonth == null) {
    return {
      text: "To schedule a payment I need who to pay, by email or saved contact name, the amount in dollars, and a day of the month between 1 and 28.",
      isError: true,
    };
  }
  if (!(args.amount > 0)) {
    return { text: "The amount must be greater than zero. Enter something like 5.00.", isError: true };
  }
  if (!Number.isInteger(args.dayOfMonth) || args.dayOfMonth < 1 || args.dayOfMonth > 28) {
    return {
      text: "Pick a day of the month between 1 and 28, so the payment has that day every month.",
      isError: true,
    };
  }

  const resolved = await resolveOrExplain(ctx, args.recipient);
  if ("error" in resolved) return resolved.error;

  const amount = args.amount.toFixed(2);
  const firstRun = nextRunDate(args.dayOfMonth, null);
  const code = token();
  ctx.pending.set(code, {
    kind: "schedule",
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
      `Once the user approves, call schedule_payment again with confirmationToken "${code}".`,
  };
}

export async function manageSchedules(
  ctx: Ctx,
  args: { action?: "list" | "pause" | "resume" | "delete"; scheduleId?: string; confirmationToken?: string },
): Promise<ToolResult> {
  if (args.confirmationToken) {
    const pending = ctx.pending.get(args.confirmationToken);
    if (!pending || pending.kind !== "schedule_delete") {
      return {
        text: "That confirmation code is not valid or has expired. Ask me to prepare the deletion again.",
        isError: true,
      };
    }
    ctx.pending.delete(args.confirmationToken);
    try {
      await ctx.client.manageSchedule({ scheduleId: pending.scheduleId, action: "delete" });
      return {
        text: `Deleted the scheduled payment of ${dollars(pending.amount)} to ${pending.recipient}. It will not run again.`,
      };
    } catch (error) {
      return fail(error);
    }
  }

  const action = args.action ?? "list";

  try {
    if (action === "list") {
      const schedules = await ctx.client.listSchedules();
      if (schedules.length === 0) {
        return { text: "You have no scheduled payments. Set one up with schedule_payment." };
      }
      const lines = schedules.map((s) => {
        const state = s.active && s.nextRun ? `next on ${formatRunDate(new Date(s.nextRun))}` : "paused";
        return `- ${dollars(s.amount)} to ${s.recipientMasked} on the ${ordinal(
          s.dayOfMonth,
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

    if (action === "pause" || action === "resume") {
      const result = await ctx.client.manageSchedule({ scheduleId: args.scheduleId, action });
      const who = result.recipient ? ` to ${result.recipient}` : "";
      const money = result.amount ? ` of ${dollars(result.amount)}` : "";
      return action === "pause"
        ? { text: `Paused the payment${money}${who}. It will not run until you resume it.` }
        : { text: `Resumed the payment${money}${who}.` };
    }

    // delete: find it first so the preview can name it, then confirm.
    const schedules = await ctx.client.listSchedules();
    const target = schedules.find((s) => s.id === args.scheduleId);
    if (!target) {
      return { text: "I could not find that schedule for this account.", isError: true };
    }
    const code = token();
    ctx.pending.set(code, {
      kind: "schedule_delete",
      scheduleId: target.id,
      amount: target.amount,
      recipient: target.recipientMasked,
    });
    return {
      text:
        `Preview, nothing has been deleted yet. Show this to the user and wait for their approval:\n` +
        `Delete the scheduled payment of ${dollars(target.amount)} to ${target.recipientMasked} on the ${ordinal(
          target.dayOfMonth,
        )} of each month. This cannot be undone, but you can set it up again later.\n` +
        `Once the user approves, call manage_schedules again with confirmationToken "${code}".`,
    };
  } catch (error) {
    return fail(error);
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function getSpendingSummary(
  ctx: Ctx,
  args: { period?: "this_week" | "this_month" | "last_month" | "custom"; from?: string; to?: string },
): Promise<ToolResult> {
  if (args.period === "custom" && (!args.from || !args.to)) {
    return {
      text: "For a custom period I need both a start and end date, each as YYYY-MM-DD.",
      isError: true,
    };
  }
  try {
    const s = await ctx.client.getSummary({ period: args.period ?? "this_month", from: args.from, to: args.to });
    if (s.transfers === 0) {
      const received = Number(s.totalReceived) > 0 ? ` You received ${dollars(s.totalReceived)}.` : "";
      return { text: `You have not sent anything ${s.periodLabel}.${received}` };
    }
    const plural = s.transfers === 1 ? "transfer" : "transfers";
    let text = `${capitalize(s.periodLabel)} you sent ${dollars(s.totalSent)} across ${s.transfers} ${plural}`;
    if (s.top.length > 0) {
      const lead = s.top[0];
      text += `, mostly to ${lead.label} who received ${dollars(lead.amount)} of it (${lead.share}%)`;
      if (s.top.length > 1) {
        text += `. Then ${s.top.slice(1).map((t) => `${t.label} ${dollars(t.amount)}`).join(", ")}`;
      }
    }
    text += ".";
    if (Number(s.totalReceived) > 0) text += ` You received ${dollars(s.totalReceived)} over the same time.`;
    return { text };
  } catch (error) {
    return fail(error);
  }
}

function loosens(cur: string | null, proposed: number | null | undefined): boolean {
  if (proposed === undefined) return false;
  if (proposed === null) return cur !== null;
  if (cur === null) return false;
  return proposed > Number(cur);
}

function describeLimits(limits: { daily: string | null; monthly: string | null }): string {
  const daily = limits.daily ? `a daily limit of ${dollars(limits.daily)}` : "no daily limit";
  const monthly = limits.monthly ? `a monthly limit of ${dollars(limits.monthly)}` : "no monthly limit";
  return `Done. You now have ${daily} and ${monthly}.`;
}

export async function setSpendingLimit(
  ctx: Ctx,
  args: { daily?: number | null; monthly?: number | null; confirmationToken?: string },
): Promise<ToolResult> {
  if (args.confirmationToken) {
    const pending = ctx.pending.get(args.confirmationToken);
    if (!pending || pending.kind !== "set_limit") {
      return {
        text: "That confirmation code is not valid or has expired. Ask me to prepare the limit change again.",
        isError: true,
      };
    }
    ctx.pending.delete(args.confirmationToken);
    try {
      const { limits } = await ctx.client.setSpendingLimit({ daily: pending.daily, monthly: pending.monthly });
      return { text: describeLimits(limits) };
    } catch (error) {
      return fail(error);
    }
  }

  if (args.daily === undefined && args.monthly === undefined) {
    return {
      text: "Tell me a daily limit, a monthly limit, or both. Use 0 or none to remove a limit.",
      isError: true,
    };
  }

  const next = {
    daily: args.daily === undefined ? undefined : args.daily && args.daily > 0 ? args.daily : null,
    monthly: args.monthly === undefined ? undefined : args.monthly && args.monthly > 0 ? args.monthly : null,
  };

  try {
    const { limits: current } = await ctx.client.getLimits();
    if (loosens(current.daily, next.daily) || loosens(current.monthly, next.monthly)) {
      const code = token();
      ctx.pending.set(code, { kind: "set_limit", daily: next.daily, monthly: next.monthly });
      return {
        text:
          `Preview, the limit has not changed yet. This loosens a safety control, so show it to the user and wait for their approval.\n` +
          `Once the user approves, call set_spending_limit again with confirmationToken "${code}".`,
      };
    }
    const { limits } = await ctx.client.setSpendingLimit(next);
    return { text: describeLimits(limits) };
  } catch (error) {
    return fail(error);
  }
}

export async function trackDebt(
  ctx: Ctx,
  args: { counterparty?: string; amount?: number; direction?: "they_owe" | "i_owe"; note?: string },
): Promise<ToolResult> {
  if (!args.counterparty || args.amount == null || !args.direction) {
    return {
      text: "To track a debt I need who it is with, the amount in dollars, and the direction: they owe you, or you owe them.",
      isError: true,
    };
  }
  try {
    const debt = await ctx.client.trackDebt({
      counterparty: args.counterparty,
      amount: args.amount,
      direction: args.direction,
      note: args.note,
    });
    const about = args.note ? ` for ${args.note}` : "";
    return debt.direction === "they_owe"
      ? { text: `Noted that ${debt.label} owes you ${dollars(debt.amount)}${about}.` }
      : { text: `Noted that you owe ${debt.label} ${dollars(debt.amount)}${about}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function listDebts(ctx: Ctx): Promise<ToolResult> {
  try {
    const { people } = await ctx.client.listDebts();
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
    return fail(error);
  }
}

export async function settleDebt(
  ctx: Ctx,
  args: { debtId?: string; pay?: boolean; confirmationToken?: string },
): Promise<ToolResult> {
  if (args.confirmationToken) {
    const pending = ctx.pending.get(args.confirmationToken);
    if (!pending || pending.kind !== "settle_send") {
      return {
        text: "That confirmation code is not valid or has expired. Ask me to prepare the payment again.",
        isError: true,
      };
    }
    ctx.pending.delete(args.confirmationToken);
    try {
      const done = await ctx.client.settleDebt({ debtId: pending.debtId, pay: true });
      return {
        text: `Sent ${dollars(done.amount ?? pending.amount)} to ${done.label ?? pending.label} and marked the debt settled. They can collect it within about an hour.`,
      };
    } catch (error) {
      return fail(error);
    }
  }

  if (!args.debtId) {
    return { text: "Tell me which debt to settle using its reference from list_debts.", isError: true };
  }

  try {
    if (args.pay) {
      // Find the debt so the preview can name it.
      const { people } = await ctx.client.listDebts();
      let found: { amount: string; label: string; direction: string } | null = null;
      for (const p of people) {
        const item = p.items.find((i) => i.id === args.debtId);
        if (item) found = { amount: item.amount, label: p.label, direction: item.direction };
      }
      if (!found) return { text: "I could not find that open debt for this account.", isError: true };
      if (found.direction !== "i_owe") {
        return {
          text: "This is money owed to you, so there is nothing to send. Mark it settled without paying once they pay you.",
          isError: true,
        };
      }
      const code = token();
      ctx.pending.set(code, { kind: "settle_send", debtId: args.debtId, amount: found.amount, label: found.label });
      return {
        text:
          `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
          `Settle by sending ${dollars(found.amount)} to ${found.label}. They will have about an hour to collect it, and the debt is marked settled once it goes out.\n` +
          `Once the user approves, call settle_debt again with confirmationToken "${code}".`,
      };
    }

    const done = await ctx.client.settleDebt({ debtId: args.debtId });
    return { text: `Marked the ${dollars(done.amount ?? "0.00")} debt as settled. No money was moved.` };
  } catch (error) {
    return fail(error);
  }
}

export async function remindDebt(ctx: Ctx, args: { debtId?: string }): Promise<ToolResult> {
  if (!args.debtId) {
    return { text: "Tell me which debt to send a reminder for, using its reference from list_debts.", isError: true };
  }
  try {
    const done = await ctx.client.remindDebt({ debtId: args.debtId });
    return { text: `Sent a friendly reminder to ${done.label} about the ${dollars(done.amount)} they owe you.` };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelSend(
  ctx: Ctx,
  args: { transactionId?: string; recipientEmail?: string; confirmationToken?: string },
): Promise<ToolResult> {
  if (args.confirmationToken) {
    const pending = ctx.pending.get(args.confirmationToken);
    if (!pending || pending.kind !== "cancel") {
      return {
        text: "That confirmation code is not valid or has expired. Ask me to prepare the call back again.",
        isError: true,
      };
    }
    ctx.pending.delete(args.confirmationToken);
    try {
      await ctx.client.cancel({ transactionId: pending.transactionId });
      return {
        text: `Called back ${dollars(pending.amount)} that was sent to ${pending.recipient}. They can no longer collect it.`,
      };
    } catch (error) {
      return fail(error);
    }
  }

  try {
    let target: { transactionId: string; amount: string; recipient: string };

    if (args.transactionId) {
      const status = await ctx.client.getStatus(args.transactionId);
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
      const match = await ctx.client.findPendingToRecipient(args.recipientEmail);
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

    const code = token();
    ctx.pending.set(code, { kind: "cancel", ...target });
    return {
      text:
        `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
        `Call back ${dollars(target.amount)} that was sent to ${target.recipient}. They have not collected it yet.\n` +
        `Once the user approves, call cancel_send again with confirmationToken "${code}".`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function getBalance(ctx: Ctx): Promise<ToolResult> {
  try {
    const data = await ctx.client.getBalance();
    let text = `Your balance is ${dollars(data.balance)}. In total you have sent ${dollars(
      data.totalSent,
    )} and received ${dollars(data.totalReceived)}, with ${data.pendingCount} send${
      data.pendingCount === 1 ? "" : "s"
    } waiting to be collected.`;

    try {
      const { usage } = await ctx.client.getLimits();
      if (usage.daily) {
        text += ` Your daily limit is ${dollars(usage.daily.limit)}, with ${dollars(usage.daily.remaining)} left today.`;
      }
      if (usage.monthly) {
        text += ` Your monthly limit is ${dollars(usage.monthly.limit)}, with ${dollars(usage.monthly.remaining)} left this month.`;
      }
      if (!usage.daily && !usage.monthly) text += " No spending limits are set.";
    } catch {
      // A limits lookup problem should not fail the balance read.
    }

    return { text };
  } catch (error) {
    return fail(error);
  }
}

export async function getHistory(
  ctx: Ctx,
  args: { limit?: number; direction?: "in" | "out"; type?: "payments" | "requests" },
): Promise<ToolResult> {
  try {
    if (args.type === "requests") {
      const requests = await ctx.client.listRequests({
        limit: args.limit ?? 10,
        direction: args.direction,
      });
      if (requests.length === 0) return { text: "There are no money requests yet." };
      const lines = requests.map((item) =>
        item.direction === "out"
          ? `Requested ${dollars(item.amount)} from ${item.counterparty}, ${requestStatusPhrase(item.status)}.`
          : `${item.counterparty} requested ${dollars(item.amount)} from you, ${requestStatusPhrase(item.status)}.`,
      );
      return { text: `Money requests:\n${lines.join("\n")}` };
    }

    const items = await ctx.client.listActivity({
      limit: args.limit ?? 10,
      direction: args.direction,
    });
    if (items.length === 0) return { text: "There is no activity yet." };

    const lines = items.map((item) => {
      const unlock =
        item.status === "pending_claim" && item.secondsUntilUnlock > 0
          ? `, unlocks in ${humanizeSeconds(item.secondsUntilUnlock)}`
          : "";
      if (item.direction === "out") {
        return `Sent ${dollars(item.amount)} to ${item.counterparty}, ${statusPhrase(item.status)}${unlock}.`;
      }
      return `Received ${dollars(item.amount)} from ${item.counterparty}, ${statusPhrase(item.status)}.`;
    });

    return { text: `Recent activity:\n${lines.join("\n")}` };
  } catch (error) {
    return fail(error);
  }
}

export async function checkClaimStatus(
  ctx: Ctx,
  args: { transactionId: string },
): Promise<ToolResult> {
  try {
    const s = await ctx.client.getStatus(args.transactionId);
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
    return fail(error);
  }
}

export async function resendClaimLink(
  ctx: Ctx,
  args: { transactionId: string },
): Promise<ToolResult> {
  try {
    const result = await ctx.client.resend({ transactionId: args.transactionId });
    if (!result.emailSent) {
      return { text: "I could not send the collection email right now.", isError: true };
    }
    return { text: `Sent the collection email again to ${result.recipient}.` };
  } catch (error) {
    return fail(error);
  }
}
