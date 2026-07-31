"use server";

import { requireFullUser } from "@/lib/auth/current-user";
import { addTestFunds } from "@/lib/cue/fund";

/**
 * Adds test funds to the signed in account from the dashboard. The account comes
 * from the session and a full sign in is required, so a scoped session cannot
 * pull funds. All caps and treasury guards live in addTestFunds.
 */
export async function addFundsAction(): Promise<{
  ok: boolean;
  amount?: string;
  error?: string;
}> {
  const user = await requireFullUser();
  try {
    const result = await addTestFunds(user);
    return { ok: true, amount: result.amount };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "We could not add funds right now. Please try again in a moment.",
    };
  }
}
