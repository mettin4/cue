#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { clientFromEnv } from "./config.js";
import { newContext, type ToolResult } from "./tools.js";
import {
  cancelSend,
  checkClaimStatus,
  getBalance,
  getHistory,
  resendClaimLink,
  sendMoney,
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
  "send_money",
  {
    title: "Send money",
    description:
      "Send money to someone by email. Two steps. First call it with recipientEmail and amount to get a preview of exactly what will happen; no money moves on this call. Show the preview to the user and wait for their explicit approval. Only after they approve, call it again with the confirmationToken from the preview to actually send. Never set confirmationToken on the first call, and never skip the approval step.",
    inputSchema: {
      recipientEmail: z
        .string()
        .email()
        .optional()
        .describe("Email address of the person receiving the money."),
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
      "List recent activity. Optional limit, default 10. Optional direction: 'out' for money sent, 'in' for money received.",
    inputSchema: {
      limit: z.number().int().positive().max(50).optional(),
      direction: z.enum(["in", "out"]).optional(),
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

async function main() {
  await server.connect(new StdioServerTransport());
  log("ready");
}

main().catch((error) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
