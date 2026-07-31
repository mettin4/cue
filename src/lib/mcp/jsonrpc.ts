import "server-only";

import type { UserRow } from "../cue/types";
import {
  cancelSend,
  checkClaimStatus,
  getBalance,
  getHistory,
  getSpendingSummaryTool,
  listContacts,
  listDebtsTool,
  manageSchedules,
  remindDebtTool,
  requestMoney,
  resendClaimLink,
  saveContact,
  schedulePayment,
  sendMoney,
  setSpendingLimit,
  settleDebtTool,
  splitMoney,
  trackDebtTool,
  type ToolOut,
} from "./tools";
import { CARD_HTML } from "./ui/card.generated";

const SERVER_VERSION = "0.1.0";
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL = "2025-06-18";

/**
 * The one MCP Apps UI resource. Every tool references it by uri in its _meta,
 * and the host fetches it with resources/read and renders it in a sandboxed
 * iframe. The card is a static template: the view it shows (a confirmation, a
 * panel or a result) and all its data come from the tool result, never baked
 * into the HTML.
 */
const CARD_URI = "ui://cue/card.html";
const UI_MIME = "text/html;profile=mcp-app";

const UI_RESOURCES: Record<string, { name: string; html: string }> = {
  [CARD_URI]: { name: "Cue", html: CARD_HTML },
};

// Both forms: the nested object the docs show, and the flat wire key the MCP
// Apps SDK always emits and the host actually reads. Serving only the nested
// form left the card unrendered in Claude.
const CARD_META = {
  ui: { resourceUri: CARD_URI },
  "ui/resourceUri": CARD_URI,
};

/**
 * Tool definitions advertised on tools/list. Same six tools and the same two
 * call preview and confirm design as the local package.
 */
const TOOLS = [
  {
    name: "send_money",
    description:
      "Send money to someone by email or by a saved contact name. Two steps. First call it with recipientEmail and amount to get a preview of exactly what will happen; no money moves on this call. Show the preview to the user and wait for their explicit approval. Only after they approve, call it again with the confirmationToken from the preview to actually send. Never set confirmationToken on the first call, and never skip the approval step.",
    inputSchema: {
      type: "object",
      properties: {
        recipientEmail: {
          type: "string",
          description: "Email of the person receiving the money, or the name of a saved contact.",
        },
        amount: { type: "number", description: "Amount in dollars." },
        confirmationToken: {
          type: "string",
          description: "Token from the preview. Only set this on the second call, after the user approves.",
        },
      },
    },
  },
  {
    name: "cancel_send",
    description:
      "Call back a send that has not been collected yet, so the recipient can no longer collect it. Two steps. First call with either the recipient email or the send reference to get a preview; no money moves. Show it to the user and wait for approval, then call again with the confirmationToken to actually call it back. If no reference is given, the most recent uncollected send to that recipient is used.",
    inputSchema: {
      type: "object",
      properties: {
        transactionId: { type: "string", description: "The send reference, if known." },
        recipientEmail: { type: "string", description: "Recipient email, used to find the most recent uncollected send." },
        confirmationToken: {
          type: "string",
          description: "Token from the preview. Only set this on the second call, after the user approves.",
        },
      },
    },
  },
  {
    name: "request_money",
    description:
      "Ask someone to pay you, by email or by a saved contact name. This is the reverse of send_money. Two steps. First call with fromEmail and amount to get a preview; no request is created yet. Show it to the user and wait for approval, then call again with the confirmationToken to send the request. The other person gets an email with a link to pay, and is not charged unless they choose to pay.",
    inputSchema: {
      type: "object",
      properties: {
        fromEmail: {
          type: "string",
          description: "Email of the person to ask, or the name of a saved contact.",
        },
        amount: { type: "number", description: "Amount in dollars to request." },
        confirmationToken: {
          type: "string",
          description: "Token from the preview. Only set this on the second call, after the user approves.",
        },
      },
    },
  },
  {
    name: "split_money",
    description:
      "Split a total evenly between several people and send each their share, by email or by saved contact name. Two steps. First call with totalAmount and recipients to get a preview that lists exactly who gets what, including who absorbs any extra cent; no money moves. Show it to the user and wait for approval, then call again with the confirmationToken. Each share is its own send that person collects, and any that fail are reported without undoing the ones that went through.",
    inputSchema: {
      type: "object",
      properties: {
        totalAmount: { type: "number", description: "The total amount in dollars to divide." },
        recipients: {
          type: "array",
          items: { type: "string" },
          description: "The people to split between, each an email or a saved contact name.",
        },
        confirmationToken: {
          type: "string",
          description: "Token from the preview. Only set this on the second call, after the user approves.",
        },
      },
    },
  },
  {
    name: "schedule_payment",
    description:
      "Set up a recurring monthly payment to someone, by email or by a saved contact name. Two steps. First call with recipient, amount and dayOfMonth (1 to 28) to get a preview that says plainly when the first payment goes out and that it repeats monthly; nothing is scheduled yet. Show it to the user and wait for approval, then call again with the confirmationToken to create it. Each run goes through the same limits and balance check as a normal send.",
    inputSchema: {
      type: "object",
      properties: {
        recipient: {
          type: "string",
          description: "Email of the person to pay, or the name of a saved contact.",
        },
        amount: { type: "number", description: "Amount in dollars to send each month." },
        dayOfMonth: {
          type: "integer",
          description: "Day of the month to pay, 1 to 28 so it exists every month.",
        },
        confirmationToken: {
          type: "string",
          description: "Token from the preview. Only set this on the second call, after the user approves.",
        },
      },
    },
  },
  {
    name: "manage_schedules",
    description:
      "List, pause, resume or delete recurring payments. Call with action 'list' (the default) to see them all, each with a reference. Use action 'pause' or 'resume' with a scheduleId to stop or restart one; these take effect immediately. Use action 'delete' with a scheduleId to remove one: this returns a preview and a confirmationToken, and only deletes after a second call with that token.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "pause", "resume", "delete"], description: "Defaults to list." },
        scheduleId: { type: "string", description: "The schedule reference from the list, for pause, resume or delete." },
        confirmationToken: {
          type: "string",
          description: "Token from a delete preview. Only set this to confirm a deletion.",
        },
      },
    },
  },
  {
    name: "save_contact",
    description:
      "Save a person to the account's contacts so they can be named instead of typed as an email next time. Saving a name that already exists updates its email address.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "What to call this person, for example Alex." },
        email: { type: "string", description: "Their email address." },
      },
      required: ["name", "email"],
    },
  },
  {
    name: "list_contacts",
    description: "List the people saved in the account's contacts, with their email addresses.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_balance",
    description:
      "Get the current account balance in dollars, plus totals sent and received, how many sends are waiting to be collected, and any daily or monthly spending limit with how much is left.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_spending_summary",
    description:
      "Summarise money sent and received over a period, with the top recipients. Optional period: 'this_week', 'this_month' (the default), 'last_month', or 'custom' with from and to dates as YYYY-MM-DD.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["this_week", "this_month", "last_month", "custom"] },
        from: { type: "string", description: "Start date YYYY-MM-DD, for a custom period." },
        to: { type: "string", description: "End date YYYY-MM-DD, for a custom period." },
      },
    },
  },
  {
    name: "set_spending_limit",
    description:
      "Set a daily limit, a monthly limit, or both, in dollars, as a safety control on how much can be sent. Pass 0 to remove a limit. Setting a first limit or lowering one takes effect immediately. Raising or removing a limit loosens the control, so it returns a preview and a confirmationToken and only applies after a second call with that token.",
    inputSchema: {
      type: "object",
      properties: {
        daily: { type: "number", description: "Daily limit in dollars, or 0 to remove it." },
        monthly: { type: "number", description: "Monthly limit in dollars, or 0 to remove it." },
        confirmationToken: {
          type: "string",
          description: "Token from a preview. Only set this to confirm a limit that loosens the control.",
        },
      },
    },
  },
  {
    name: "track_debt",
    description:
      "Record money owed between you and someone else, without moving anything. Give the counterparty by email or saved contact name, the amount, and the direction: 'they_owe' if they owe you, or 'i_owe' if you owe them. An optional note says what it is for.",
    inputSchema: {
      type: "object",
      properties: {
        counterparty: { type: "string", description: "The other person, by email or saved contact name." },
        amount: { type: "number", description: "Amount in dollars." },
        direction: { type: "string", enum: ["they_owe", "i_owe"] },
        note: { type: "string", description: "What the debt is for, optional." },
      },
      required: ["counterparty", "amount", "direction"],
    },
  },
  {
    name: "list_debts",
    description:
      "List open debts in both directions, grouped by person, with the net position for each and a reference for every entry.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "settle_debt",
    description:
      "Mark a debt settled. Takes the debt reference from list_debts. By default it just marks it settled and moves no money. If you owe the person, pass pay set to true to settle by actually sending the money: that returns a normal send preview and confirmationToken, and only sends after a second call with that token. Money is never sent automatically.",
    inputSchema: {
      type: "object",
      properties: {
        debtId: { type: "string", description: "The debt reference from list_debts." },
        pay: { type: "boolean", description: "Set true to settle a debt you owe by sending the money." },
        confirmationToken: {
          type: "string",
          description: "Token from a settle by sending preview. Only set this to confirm the payment.",
        },
      },
    },
  },
  {
    name: "remind_debt",
    description:
      "Email a short, friendly reminder to someone who owes you, for a debt from list_debts. Only works for money owed to you, only when an email is on file, and at most once per debt per day.",
    inputSchema: {
      type: "object",
      properties: { debtId: { type: "string", description: "The debt reference from list_debts." } },
      required: ["debtId"],
    },
  },
  {
    name: "get_history",
    description:
      "List recent activity. Optional limit, default 10. Optional direction: 'out' for money sent or requests you made, 'in' for money received or requests made to you. Optional type: 'payments' (the default) for money sent and received, or 'requests' for money requests.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "How many rows, up to 50." },
        direction: { type: "string", enum: ["in", "out"] },
        type: { type: "string", enum: ["payments", "requests"], description: "Defaults to payments." },
      },
    },
  },
  {
    name: "check_claim_status",
    description:
      "Check whether a specific send has been collected yet and how long is left before the recipient can collect it. Takes the send reference.",
    inputSchema: {
      type: "object",
      properties: { transactionId: { type: "string", description: "The send reference to check." } },
      required: ["transactionId"],
    },
  },
  {
    name: "resend_claim_link",
    description:
      "Send the collection email again for a send that is still waiting to be collected. Takes the send reference.",
    inputSchema: {
      type: "object",
      properties: { transactionId: { type: "string", description: "The send reference to resend." } },
      required: ["transactionId"],
    },
  },
];

type RpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type RpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

function toolResult(out: ToolOut) {
  const result: {
    content: { type: "text"; text: string }[];
    isError: boolean;
    structuredContent?: Record<string, unknown>;
  } = {
    content: [{ type: "text", text: out.text }],
    isError: out.isError ?? false,
  };
  // Structured data rides alongside the text, for an MCP Apps view. The text
  // stays the fallback for clients that do not render the card.
  if (out.structuredContent) result.structuredContent = out.structuredContent;
  return result;
}

async function callTool(user: UserRow, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "send_money":
      return sendMoney(user, args);
    case "cancel_send":
      return cancelSend(user, args);
    case "request_money":
      return requestMoney(user, args);
    case "split_money":
      return splitMoney(user, args as { totalAmount?: number; recipients?: string[]; confirmationToken?: string });
    case "schedule_payment":
      return schedulePayment(user, args as { recipient?: string; amount?: number; dayOfMonth?: number; confirmationToken?: string });
    case "manage_schedules":
      return manageSchedules(user, args as { action?: "list" | "pause" | "resume" | "delete"; scheduleId?: string; confirmationToken?: string });
    case "save_contact":
      return saveContact(user, args as { name?: string; email?: string });
    case "list_contacts":
      return listContacts(user);
    case "get_balance":
      return getBalance(user);
    case "get_spending_summary":
      return getSpendingSummaryTool(user, args as { period?: "this_week" | "this_month" | "last_month" | "custom"; from?: string; to?: string });
    case "set_spending_limit":
      return setSpendingLimit(user, args as { daily?: number | null; monthly?: number | null; confirmationToken?: string });
    case "track_debt":
      return trackDebtTool(user, args as { counterparty?: string; amount?: number; direction?: "they_owe" | "i_owe"; note?: string });
    case "list_debts":
      return listDebtsTool(user);
    case "settle_debt":
      return settleDebtTool(user, args as { debtId?: string; pay?: boolean; confirmationToken?: string });
    case "remind_debt":
      return remindDebtTool(user, args as { debtId?: string });
    case "get_history":
      return getHistory(user, args);
    case "check_claim_status":
      return checkClaimStatus(user, args as { transactionId: string });
    case "resend_claim_link":
      return resendClaimLink(user, args as { transactionId: string });
    default:
      return null;
  }
}

/**
 * Handles one JSON-RPC message. Returns a response for requests, or null for
 * notifications (which the caller answers with 202).
 */
export async function handleMessage(
  user: UserRow,
  message: RpcRequest,
): Promise<RpcResponse | null> {
  const id = message.id ?? null;

  // Notifications have no id and expect no response.
  if (message.id === undefined || message.id === null) {
    if (message.method.startsWith("notifications/")) return null;
  }

  switch (message.method) {
    case "initialize": {
      const requested = (message.params?.protocolVersion as string) ?? DEFAULT_PROTOCOL;
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            // The UI cards for MCP Apps are served as read only resources.
            resources: { listChanged: false },
          },
          serverInfo: { name: "cue", version: SERVER_VERSION },
        },
      };
    }

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      // Every tool renders through the one Cue card.
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS.map((t) => ({ ...t, _meta: CARD_META })) },
      };

    case "resources/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          resources: Object.entries(UI_RESOURCES).map(([uri, r]) => ({
            uri,
            name: r.name,
            mimeType: UI_MIME,
          })),
        },
      };

    case "resources/read": {
      const uri = message.params?.uri as string;
      const resource = UI_RESOURCES[uri];
      if (!resource) {
        return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown resource: ${uri}` } };
      }
      return {
        jsonrpc: "2.0",
        id,
        result: { contents: [{ uri, mimeType: UI_MIME, text: resource.html }] },
      };
    }

    case "tools/call": {
      const name = message.params?.name as string;
      const args = (message.params?.arguments as Record<string, unknown>) ?? {};
      const out = await callTool(user, name, args);
      if (!out) {
        return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${name}` } };
      }
      return { jsonrpc: "2.0", id, result: toolResult(out) };
    }

    default:
      if (message.method.startsWith("notifications/")) return null;
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${message.method}` },
      };
  }
}
