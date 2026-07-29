"use server";

import { deleteContact } from "@/lib/cue/contacts";

/**
 * Demo affordance for removing a saved contact. There is no sign in yet, so this
 * acts for the account id the dashboard is viewing. Real auth replaces that in a
 * later phase.
 */
export async function deleteContactAction(
  userId: string,
  id: string,
): Promise<{ ok: boolean }> {
  const ok = await deleteContact(userId, id);
  return { ok };
}
