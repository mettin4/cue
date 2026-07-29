"use server";

import { requireFullUser } from "@/lib/auth/current-user";
import { settleDebt } from "@/lib/cue/debts";

/**
 * Settling debts from the dashboard. The account comes from the signed in
 * session and a full sign in is required. Marking settled moves no money.
 */
export async function settleDebtsAction(ids: string[]): Promise<{ settled: number }> {
  const user = await requireFullUser();
  let settled = 0;
  for (const id of ids) {
    const row = await settleDebt(user.id, id);
    if (row) settled += 1;
  }
  return { settled };
}
