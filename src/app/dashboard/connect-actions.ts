"use server";

import { requireFullUser } from "@/lib/auth/current-user";
import { appUrl } from "@/lib/config";
import { generateConnectToken, regenerateToken, revokeTokens } from "@/lib/mcp/tokens";

/**
 * Managing the connect link. The account is taken from the signed in session, so
 * only the owner can create, revoke or regenerate their own link. A scoped
 * session, minted by collecting money, cannot reach these at all.
 */

function connectUrl(token: string): string {
  return `${appUrl()}/api/mcp/${token}`;
}

export async function generateConnect(): Promise<string> {
  const user = await requireFullUser();
  const created = await generateConnectToken(user.id);
  return connectUrl(created.token);
}

export async function regenerateConnect(): Promise<string> {
  const user = await requireFullUser();
  const created = await regenerateToken(user.id);
  return connectUrl(created.token);
}

export async function revokeConnect(): Promise<null> {
  const user = await requireFullUser();
  await revokeTokens(user.id);
  return null;
}
