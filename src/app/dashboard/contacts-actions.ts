"use server";

import { requireFullUser } from "@/lib/auth/current-user";
import { deleteContact } from "@/lib/cue/contacts";

/**
 * Removing a saved contact. The account comes from the signed in session and a
 * full sign in is required.
 */
export async function deleteContactAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireFullUser();
  const ok = await deleteContact(user.id, id);
  return { ok };
}
