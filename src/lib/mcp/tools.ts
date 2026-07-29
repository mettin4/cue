import "server-only";

import {
  findLatestPendingSend,
  getSendStatus,
  resendClaimEmail,
} from "../cue/actions";
import { cancelSend as cancelSendCore } from "../cue/cancel";
import { getDashboardData } from "../cue/dashboard";
import { parseAmount } from "../cue/money";
import { createSend } from "../cue/send";
import type { UserRow } from "../cue/types";
import { issueConfirmation, readConfirmation } from "./confirm";
import { dollars, humanizeSeconds, statusPhrase } from "./format";

export type ToolOut = { text: string; isError?: boolean };

function secondsUntil(deadline: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 1000));
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
      text: "To send money I need the recipient email and the amount in dollars.",
      isError: true,
    };
  }

  let amount: string;
  try {
    amount = parseAmount(args.amount);
  } catch (error) {
    return { text: message(error), isError: true };
  }

  const token = issueConfirmation({
    kind: "send",
    userId: user.id,
    recipientEmail: args.recipientEmail,
    amount,
  });

  return {
    text:
      `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
      `Send ${dollars(amount)} to ${args.recipientEmail}. They will have about an hour to collect it, and you can call it back during that time.\n` +
      `Once the user approves, call send_money again with confirmationToken "${token}".`,
  };
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
  args: { limit?: number; direction?: "in" | "out" },
): Promise<ToolOut> {
  try {
    const data = await getDashboardData(user);
    const items = data.activity
      .filter((item) => !args.direction || item.direction === args.direction)
      .slice(0, Math.min(Math.max(args.limit ?? 10, 1), 50));

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
