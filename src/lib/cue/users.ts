import "server-only";

import { getSupabaseAdmin } from "../supabase/server";
import { normaliseEmail } from "./money";
import type { UserRow } from "./types";

const USER_FIELDS =
  "id, email, circle_wallet_id, circle_wallet_address, created_at";

/**
 * Resolves the acting account by email, creating the user row if this is the
 * first time Cue has seen the address. The sender does not need a wallet: funds
 * come from the treasury, so a plain users row is enough to act as a sender.
 */
export async function findOrCreateUserByEmail(email: string): Promise<UserRow> {
  const normalised = normaliseEmail(email);
  if (!normalised.includes("@")) {
    throw new Error(`"${email}" is not a valid email address.`);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .upsert({ email: normalised }, { onConflict: "email" })
    .select(USER_FIELDS)
    .single<UserRow>();

  if (error || !data) {
    throw new Error(
      `Could not resolve the account: ${error?.message ?? "no row returned"}`,
    );
  }

  return data;
}
