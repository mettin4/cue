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
import { dollars, humanizeSeconds, secondsUntil, statusPhrase } from "./format.js";

type PendingSend = { kind: "send"; recipientEmail: string; amount: string };
type PendingCancel = {
  kind: "cancel";
  transactionId: string;
  amount: string;
  recipient: string;
};

export type Ctx = {
  client: CueClient;
  pending: Map<string, PendingSend | PendingCancel>;
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
      text: "To send money I need the recipient email and the amount in dollars.",
      isError: true,
    };
  }
  if (!(args.amount > 0)) {
    return { text: "The amount must be greater than zero.", isError: true };
  }

  const amount = args.amount.toFixed(2);
  const code = token();
  ctx.pending.set(code, { kind: "send", recipientEmail: args.recipientEmail, amount });

  return {
    text:
      `Preview, no money has moved yet. Show this to the user and wait for their approval:\n` +
      `Send ${dollars(amount)} to ${args.recipientEmail}. They will have about an hour to collect it, and you can call it back during that time.\n` +
      `Once the user approves, call send_money again with confirmationToken "${code}".`,
  };
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
    return {
      text: `Your balance is ${dollars(data.balance)}. In total you have sent ${dollars(
        data.totalSent,
      )} and received ${dollars(data.totalReceived)}, with ${data.pendingCount} send${
        data.pendingCount === 1 ? "" : "s"
      } waiting to be collected.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function getHistory(
  ctx: Ctx,
  args: { limit?: number; direction?: "in" | "out" },
): Promise<ToolResult> {
  try {
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
