import "server-only";

import {
  findLatestPendingSend,
  getSendStatus,
  resendClaimEmail,
} from "../cue/actions";
import { cancelSend as cancelSendCore } from "../cue/cancel";
import { maxSendUsdc } from "../config";
import {
  listContacts as listContactsCore,
  resolveRecipient,
  saveContact as saveContactCore,
} from "../cue/contacts";
import { getDashboardData } from "../cue/dashboard";
import { parseAmount, splitAmount } from "../cue/money";
import { createRequest, listRequests } from "../cue/requests";
import { createSend } from "../cue/send";
import type { UserRow } from "../cue/types";
import { issueConfirmation, readConfirmation } from "./confirm";
import {
  dollars,
  humanizeSeconds,
  requestStatusPhrase,
  statusPhrase,
} from "./format";

export type ToolOut = { text: string; isError?: boolean };

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
    try {
      const result = await createSend({
        senderUserId: user.id,
        recipientEmail: payload.recipientEmail,
        amountUsdc: payload.amount,
      });
      const unlock = humanizeSeconds(secondsUntil(result.cancelDeadline));
      return {
        text: `Sent ${dollars(payload.amount)} to ${payload.recipientEmail}. They can collect it in ${unlock}, and you can call it back until then.`,
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

  return {
    text:
      `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
      `Send ${dollars(amount)} to ${resolved.label}. They will have about an hour to collect it, and you can call it back during that time.\n` +
      `Once the user approves, call send_money again with confirmationToken "${token}".`,
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
    return {
      text: `Your balance is ${dollars(data.balance)}. In total you have sent ${dollars(
        data.stats.totalSent,
      )} and received ${dollars(data.stats.totalReceived)}, with ${data.stats.pendingCount} send${
        data.stats.pendingCount === 1 ? "" : "s"
      } waiting to be collected.`,
    };
  } catch (error) {
    return { text: message(error), isError: true };
  }
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
