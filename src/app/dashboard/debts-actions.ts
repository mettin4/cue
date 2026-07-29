"use server";

import { settleDebt } from "@/lib/cue/debts";

/**
 * Demo affordance for settling debts from the dashboard. There is no sign in
 * yet, so this acts for the account id the dashboard is viewing. Real auth
 * replaces that in a later phase. Marking settled moves no money.
 */
export async function settleDebtsAction(
  userId: string,
  ids: string[],
): Promise<{ settled: number }> {
  let settled = 0;
  for (const id of ids) {
    const row = await settleDebt(userId, id);
    if (row) settled += 1;
  }
  return { settled };
}
