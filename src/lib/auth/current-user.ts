import "server-only";

import { resolveDashboardUser } from "../cue/dashboard";
import { findOrCreateUserByEmail } from "../cue/users";
import { createServerSupabase } from "../supabase/ssr";
import type { UserRow } from "../cue/types";
import { readScopedSession } from "./scoped";

export type Scope = "full" | "scoped";
export type CurrentUser = { user: UserRow; scope: Scope };

/**
 * Resolves who is acting on the website, in order of power:
 *   full    a completed magic link sign in, mapped to the account by email
 *   scoped  a session minted from collecting money, can view but not act
 *   null    signed out
 *
 * A full Supabase session always wins over a scoped cookie, so signing in
 * upgrades a collector to a full account holder on the same email.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (authUser?.email) {
    // Link the verified email to our own account row, creating it the first time
    // and reusing it forever after, so existing data is never duplicated.
    const user = await findOrCreateUserByEmail(authUser.email);
    return { user, scope: "full" };
  }

  const scopedUserId = await readScopedSession();
  if (scopedUserId) {
    const user = await resolveDashboardUser(scopedUserId);
    if (user) return { user, scope: "scoped" };
  }

  return null;
}

/**
 * True when the acting person has a full sign in. Restricted actions check this
 * and refuse a scoped session with a message that points to signing in.
 */
export function isFull(current: CurrentUser | null): current is CurrentUser & { scope: "full" } {
  return current?.scope === "full";
}

/**
 * Returns the fully signed in account or throws. Every restricted server action
 * calls this and acts on the returned id, never an id passed from the client, so
 * one person cannot act on another's account.
 */
export async function requireFullUser(): Promise<UserRow> {
  const current = await getCurrentUser();
  if (!current) {
    throw new Error("You need to sign in to do that. Enter your email on the dashboard to get a link.");
  }
  if (current.scope !== "full") {
    throw new Error("Collecting money does not sign you in fully. Sign in with your email to do that.");
  }
  return current.user;
}
