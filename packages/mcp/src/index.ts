#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { clientFromEnv } from "./config.js";
import { newContext, type ToolResult } from "./tools.js";
import {
  addFunds,
  cancelSend,
  checkClaimStatus,
  getBalance,
  getHistory,
  getSpendingSummary,
  listContacts,
  listDebts,
  manageSchedules,
  remindDebt,
  requestMoney,
  resendClaimLink,
  saveContact,
  schedulePayment,
  sendMoney,
  setSpendingLimit,
  settleDebt,
  splitMoney,
  trackDebt,
} from "./tools.js";

// Logs must go to stderr. stdout is the protocol channel.
function log(message: string) {
  process.stderr.write(`[cue-mcp] ${message}\n`);
}

const client = (() => {
  try {
    return clientFromEnv();
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();

const ctx = newContext(client);

function result(r: ToolResult) {
  return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
}

const server = new McpServer({ name: "cue", version: "0.1.0" });

server.registerTool(
  "add_funds",
  {
    title: "Add test funds",
    description:
      "Add a small amount of test funds to the account from the shared demo pool, on this testnet demo. The funds have no real value. There is nothing to confirm and no details are needed. It is capped: a fixed amount per request, a limit per account in total, and a short wait between top ups. If the account has reached its limit or the wait has not passed, it says so and what to do next. On the real network funding would come through Circle; this is the placeholder until then.",
    inputSchema: {},
  },
  async () => result(await addFunds(ctx)),
);

server.registerTool(
  "send_money",
  {
    title: "Send money",
    description:
      "Send money to someone by email or by a saved contact name. Two steps. First call it with recipientEmail and amount to get a preview of exactly what will happen; no money moves on this call. Show the preview to the user and wait for their explicit approval. Only after they approve, call it again with the confirmationToken from the preview to actually send. Never set confirmationToken on the first call, and never skip the approval step.",
    inputSchema: {
      recipientEmail: z
        .string()
        .optional()
        .describe("Email of the person receiving the money, or the name of a saved contact."),
      amount: z.number().positive().optional().describe("Amount in dollars."),
      confirmationToken: z
        .string()
        .optional()
        .describe("Token from the preview. Only set this on the second call, after the user approves."),
    },
  },
  async (args) => result(await sendMoney(ctx, args)),
);

server.registerTool(
  "request_money",
  {
    title: "Request money",
    description:
      "Ask someone to pay you, by email or by a saved contact name. The reverse of send_money. Two steps. First call with fromEmail and amount to get a preview; no request is created yet. Show it to the user and wait for approval, then call again with the confirmationToken to send the request. The other person gets an email with a link to pay, and is not charged unless they choose to pay.",
    inputSchema: {
      fromEmail: z
        .string()
        .optional()
        .describe("Email of the person to ask, or the name of a saved contact."),
      amount: z.number().positive().optional().describe("Amount in dollars to request."),
      confirmationToken: z
        .string()
        .optional()
        .describe("Token from the preview. Only set this on the second call, after the user approves."),
    },
  },
  async (args) => result(await requestMoney(ctx, args)),
);

server.registerTool(
  "split_money",
  {
    title: "Split money",
    description:
      "Split a total evenly between several people and send each their share, by email or by saved contact name. Two steps. First call with totalAmount and recipients to get a preview that lists exactly who gets what, including who absorbs any extra cent; no money moves. Show it to the user and wait for approval, then call again with the confirmationToken. Each share is its own send, and any that fail are reported without undoing the ones that went through.",
    inputSchema: {
      totalAmount: z.number().positive().optional().describe("The total amount in dollars to divide."),
      recipients: z
        .array(z.string())
        .optional()
        .describe("The people to split between, each an email or a saved contact name."),
      confirmationToken: z
        .string()
        .optional()
        .describe("Token from the preview. Only set this on the second call, after the user approves."),
    },
  },
  async (args) => result(await splitMoney(ctx, args)),
);

server.registerTool(
  "schedule_payment",
  {
    title: "Schedule a payment",
    description:
      "Set up a recurring monthly payment to someone, by email or by a saved contact name. Two steps. First call with recipient, amount and dayOfMonth (1 to 28) to get a preview that says when the first payment goes out and that it repeats monthly; nothing is scheduled yet. Show it to the user and wait for approval, then call again with the confirmationToken to create it. Each run goes through the same limits and balance check as a normal send.",
    inputSchema: {
      recipient: z
        .string()
        .optional()
        .describe("Email of the person to pay, or the name of a saved contact."),
      amount: z.number().positive().optional().describe("Amount in dollars to send each month."),
      dayOfMonth: z
        .number()
        .int()
        .min(1)
        .max(28)
        .optional()
        .describe("Day of the month to pay, 1 to 28 so it exists every month."),
      confirmationToken: z
        .string()
        .optional()
        .describe("Token from the preview. Only set this on the second call, after the user approves."),
    },
  },
  async (args) => result(await schedulePayment(ctx, args)),
);

server.registerTool(
  "manage_schedules",
  {
    title: "Manage schedules",
    description:
      "List, pause, resume or delete recurring payments. Call with action 'list' (the default) to see them all, each with a reference. Use action 'pause' or 'resume' with a scheduleId to stop or restart one; these take effect immediately. Use action 'delete' with a scheduleId to remove one: this returns a preview and a confirmationToken, and only deletes after a second call with that token.",
    inputSchema: {
      action: z.enum(["list", "pause", "resume", "delete"]).optional(),
      scheduleId: z.string().optional().describe("The schedule reference from the list."),
      confirmationToken: z
        .string()
        .optional()
        .describe("Token from a delete preview. Only set this to confirm a deletion."),
    },
  },
  async (args) => result(await manageSchedules(ctx, args)),
);

server.registerTool(
  "save_contact",
  {
    title: "Save a contact",
    description:
      "Save a person to the account's contacts so they can be named instead of typed as an email next time. Saving a name that already exists updates its email address.",
    inputSchema: {
      name: z.string().describe("What to call this person, for example Alex."),
      email: z.string().email().describe("Their email address."),
    },
  },
  async (args) => result(await saveContact(ctx, args)),
);

server.registerTool(
  "list_contacts",
  {
    title: "List contacts",
    description: "List the people saved in the account's contacts, with their email addresses.",
    inputSchema: {},
  },
  async () => result(await listContacts(ctx)),
);

server.registerTool(
  "cancel_send",
  {
    title: "Call a send back",
    description:
      "Call back a send that has not been collected yet, so the recipient can no longer collect it. Two steps. First call with either the recipient email or the send reference to get a preview; no money moves. Show it to the user and wait for approval, then call again with the confirmationToken to actually call it back. If no reference is given, the most recent uncollected send to that recipient is used.",
    inputSchema: {
      transactionId: z.string().optional().describe("The send reference, if known."),
      recipientEmail: z
        .string()
        .email()
        .optional()
        .describe("Recipient email, used to find the most recent uncollected send."),
      confirmationToken: z
        .string()
        .optional()
        .describe("Token from the preview. Only set this on the second call, after the user approves."),
    },
  },
  async (args) => result(await cancelSend(ctx, args)),
);

server.registerTool(
  "get_balance",
  {
    title: "Get balance",
    description:
      "Get the current account balance in dollars, plus totals sent and received and how many sends are waiting to be collected.",
    inputSchema: {},
  },
  async () => result(await getBalance(ctx)),
);

server.registerTool(
  "get_history",
  {
    title: "Get recent activity",
    description:
      "List recent activity. Optional limit, default 10. Optional direction: 'out' for money sent or requests you made, 'in' for money received or requests made to you. Optional type: 'payments' (the default) for money sent and received, or 'requests' for money requests.",
    inputSchema: {
      limit: z.number().int().positive().max(50).optional(),
      direction: z.enum(["in", "out"]).optional(),
      type: z.enum(["payments", "requests"]).optional(),
    },
  },
  async (args) => result(await getHistory(ctx, args)),
);

server.registerTool(
  "check_claim_status",
  {
    title: "Check collect status",
    description:
      "Check whether a specific send has been collected yet and how long is left before the recipient can collect it. Takes the send reference.",
    inputSchema: {
      transactionId: z.string().describe("The send reference to check."),
    },
  },
  async (args) => result(await checkClaimStatus(ctx, args)),
);

server.registerTool(
  "resend_claim_link",
  {
    title: "Resend the collection email",
    description:
      "Send the collection email again for a send that is still waiting to be collected. Takes the send reference.",
    inputSchema: {
      transactionId: z.string().describe("The send reference to resend the email for."),
    },
  },
  async (args) => result(await resendClaimLink(ctx, args)),
);

server.registerTool(
  "get_spending_summary",
  {
    title: "Spending summary",
    description:
      "Summarise money sent and received over a period, with the top recipients. Optional period: 'this_week', 'this_month' (the default), 'last_month', or 'custom' with from and to dates as YYYY-MM-DD.",
    inputSchema: {
      period: z.enum(["this_week", "this_month", "last_month", "custom"]).optional(),
      from: z.string().optional().describe("Start date YYYY-MM-DD, for a custom period."),
      to: z.string().optional().describe("End date YYYY-MM-DD, for a custom period."),
    },
  },
  async (args) => result(await getSpendingSummary(ctx, args)),
);

server.registerTool(
  "set_spending_limit",
  {
    title: "Set a spending limit",
    description:
      "Set a daily limit, a monthly limit, or both, in dollars, as a safety control. Pass 0 to remove a limit. Setting a first limit or lowering one takes effect immediately. Raising or removing a limit loosens the control, so it returns a preview and a confirmationToken and only applies after a second call with that token.",
    inputSchema: {
      daily: z.number().nonnegative().optional().describe("Daily limit in dollars, or 0 to remove it."),
      monthly: z.number().nonnegative().optional().describe("Monthly limit in dollars, or 0 to remove it."),
      confirmationToken: z
        .string()
        .optional()
        .describe("Token from a preview. Only set this to confirm a limit that loosens the control."),
    },
  },
  async (args) => result(await setSpendingLimit(ctx, args)),
);

server.registerTool(
  "track_debt",
  {
    title: "Track a debt",
    description:
      "Record money owed between you and someone else, without moving anything. Give the counterparty by email or saved contact name, the amount, and the direction: 'they_owe' if they owe you, or 'i_owe' if you owe them. An optional note says what it is for.",
    inputSchema: {
      counterparty: z.string().describe("The other person, by email or saved contact name."),
      amount: z.number().positive().describe("Amount in dollars."),
      direction: z.enum(["they_owe", "i_owe"]),
      note: z.string().optional().describe("What the debt is for, optional."),
    },
  },
  async (args) => result(await trackDebt(ctx, args)),
);

server.registerTool(
  "list_debts",
  {
    title: "List debts",
    description:
      "List open debts in both directions, grouped by person, with the net position for each and a reference for every entry.",
    inputSchema: {},
  },
  async () => result(await listDebts(ctx)),
);

server.registerTool(
  "settle_debt",
  {
    title: "Settle a debt",
    description:
      "Mark a debt settled. Takes the debt reference from list_debts. By default it just marks it settled and moves no money. If you owe the person, pass pay set to true to settle by actually sending the money: that returns a normal send preview and confirmationToken, and only sends after a second call with that token. Money is never sent automatically.",
    inputSchema: {
      debtId: z.string().optional().describe("The debt reference from list_debts."),
      pay: z.boolean().optional().describe("Set true to settle a debt you owe by sending the money."),
      confirmationToken: z
        .string()
        .optional()
        .describe("Token from a settle by sending preview. Only set this to confirm the payment."),
    },
  },
  async (args) => result(await settleDebt(ctx, args)),
);

server.registerTool(
  "remind_debt",
  {
    title: "Remind about a debt",
    description:
      "Email a short, friendly reminder to someone who owes you, for a debt from list_debts. Only works for money owed to you, only when an email is on file, and at most once per debt per day.",
    inputSchema: {
      debtId: z.string().describe("The debt reference from list_debts."),
    },
  },
  async (args) => result(await remindDebt(ctx, args)),
);

async function main() {
  await server.connect(new StdioServerTransport());
  log("ready");
}

main().catch((error) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
