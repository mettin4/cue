import "server-only";

import { randomBytes } from "crypto";

import { getSupabaseAdmin } from "../supabase/server";
import type { UserRow } from "../cue/types";

const USER_FIELDS =
  "id, email, circle_wallet_id, circle_wallet_address, created_at";

export type ConnectToken = {
  id: string;
  token: string;
  label: string | null;
  created_at: string | null;
  last_used_at: string | null;
};

/**
 * 32 characters of base64url, 192 bits of entropy. The token is the credential
 * that a personal connect URL carries, so it must not be guessable.
 */
function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Resolves a connect token to its account. Returns null for an unknown or
 * revoked token. Updates last_used_at as a side effect. This is the only way
 * the remote MCP server learns which account it acts for.
 */
export async function resolveConnectToken(token: string): Promise<UserRow | null> {
  if (!token) return null;
  const supabase = getSupabaseAdmin();

  const { data: row } = await supabase
    .from("connect_tokens")
    .select("id, user_id, revoked_at")
    .eq("token", token)
    .maybeSingle<{ id: string; user_id: string; revoked_at: string | null }>();

  if (!row || row.revoked_at) return null;

  // Best effort touch, never blocks resolution.
  await supabase
    .from("connect_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  const { data: user } = await supabase
    .from("users")
    .select(USER_FIELDS)
    .eq("id", row.user_id)
    .maybeSingle<UserRow>();

  return user ?? null;
}

/**
 * The active connect token for an account, or null if there is none.
 */
export async function getActiveToken(userId: string): Promise<ConnectToken | null> {
  const { data } = await getSupabaseAdmin()
    .from("connect_tokens")
    .select("id, token, label, created_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ConnectToken>();

  return data ?? null;
}

/**
 * Creates a new active token for an account.
 */
export async function generateConnectToken(
  userId: string,
  label?: string,
): Promise<ConnectToken> {
  const { data, error } = await getSupabaseAdmin()
    .from("connect_tokens")
    .insert({ user_id: userId, token: newToken(), label: label ?? null })
    .select("id, token, label, created_at, last_used_at")
    .single<ConnectToken>();

  if (error || !data) {
    throw new Error(`Could not create a connect link: ${error?.message ?? "no row"}`);
  }
  return data;
}

/**
 * Revokes every active token for an account. A revoked token can no longer
 * move money.
 */
export async function revokeTokens(userId: string): Promise<void> {
  await getSupabaseAdmin()
    .from("connect_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
}

/**
 * Revokes the current token and issues a fresh one.
 */
export async function regenerateToken(userId: string): Promise<ConnectToken> {
  await revokeTokens(userId);
  return generateConnectToken(userId);
}
