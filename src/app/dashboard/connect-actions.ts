"use server";

import { appUrl } from "@/lib/config";
import {
  generateConnectToken,
  regenerateToken,
  revokeTokens,
} from "@/lib/mcp/tokens";

/**
 * Demo affordance for managing a personal connect link. There is no sign in
 * yet, so these act for the account id the dashboard is viewing. Real auth
 * replaces that in a later phase.
 */

function connectUrl(token: string): string {
  return `${appUrl()}/api/mcp/${token}`;
}

export async function generateConnect(userId: string): Promise<string> {
  const created = await generateConnectToken(userId);
  return connectUrl(created.token);
}

export async function regenerateConnect(userId: string): Promise<string> {
  const created = await regenerateToken(userId);
  return connectUrl(created.token);
}

export async function revokeConnect(userId: string): Promise<null> {
  await revokeTokens(userId);
  return null;
}
