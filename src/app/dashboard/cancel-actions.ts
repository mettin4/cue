"use server";

import { requireFullUser } from "@/lib/auth/current-user";
import { cancelSend } from "@/lib/cue/cancel";

/**
 * Calls a send back from the dashboard. The account comes from the signed in
 * session and a full sign in is required, so a scoped session cannot move money.
 */
export async function cancelSendAction(
  transactionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireFullUser();
  try {
    await cancelSend({ transactionId, senderUserId: user.id });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "We could not call this back. Please try again.",
    };
  }
}
