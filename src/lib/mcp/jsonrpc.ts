import "server-only";

import type { UserRow } from "../cue/types";
import {
  cancelSend,
  checkClaimStatus,
  getBalance,
  getHistory,
  listContacts,
  requestMoney,
  resendClaimLink,
  saveContact,
  sendMoney,
  splitMoney,
  type ToolOut,
} from "./tools";

const SERVER_VERSION = "0.1.0";
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL = "2025-06-18";

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
      "Get the current account balance in dollars, plus totals sent and received and how many sends are waiting to be collected.",
    inputSchema: { type: "object", properties: {} },
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
  return { content: [{ type: "text", text: out.text }], isError: out.isError ?? false };
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
    case "save_contact":
      return saveContact(user, args as { name?: string; email?: string });
    case "list_contacts":
      return listContacts(user);
    case "get_balance":
      return getBalance(user);
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
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "cue", version: SERVER_VERSION },
        },
      };
    }

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

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
