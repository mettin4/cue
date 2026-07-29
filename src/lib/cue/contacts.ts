import "server-only";

import { getSupabaseAdmin } from "../supabase/server";
import { normaliseEmail } from "./money";
import type { ContactRow } from "./types";

const FIELDS = "id, user_id, name, email, created_at";

/**
 * Saves a contact for an account. The name is unique per account, matched
 * without regard to case, so saving the same name again updates the address.
 */
export async function saveContact(
  userId: string,
  name: string,
  email: string,
): Promise<ContactRow> {
  const cleanName = name.trim();
  const cleanEmail = normaliseEmail(email);

  if (!cleanName) {
    throw new Error("A contact needs a name. Tell me what to call this person.");
  }
  if (!cleanEmail.includes("@")) {
    throw new Error(
      `"${email}" does not look like a valid email address. Check it and try again.`,
    );
  }

  const supabase = getSupabaseAdmin();

  // Update in place when the name already exists for this account, otherwise
  // insert. The unique index is on (user_id, lower(name)), so this keeps one row
  // per name without tripping the constraint.
  const { data: existing } = await supabase
    .from("contacts")
    .select(FIELDS)
    .eq("user_id", userId)
    .ilike("name", cleanName)
    .maybeSingle<ContactRow>();

  if (existing) {
    const { data, error } = await supabase
      .from("contacts")
      .update({ email: cleanEmail, name: cleanName })
      .eq("id", existing.id)
      .select(FIELDS)
      .single<ContactRow>();
    if (error || !data) {
      throw new Error(`Could not update that contact: ${error?.message ?? "no row"}`);
    }
    return data;
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({ user_id: userId, name: cleanName, email: cleanEmail })
    .select(FIELDS)
    .single<ContactRow>();

  if (error || !data) {
    throw new Error(`Could not save that contact: ${error?.message ?? "no row"}`);
  }
  return data;
}

/**
 * Every contact for an account, newest first.
 */
export async function listContacts(userId: string): Promise<ContactRow[]> {
  const { data } = await getSupabaseAdmin()
    .from("contacts")
    .select(FIELDS)
    .eq("user_id", userId)
    .order("name", { ascending: true });

  return (data ?? []) as ContactRow[];
}

/**
 * Deletes one contact owned by this account. Returns false when nothing matched,
 * so a stale delete does not look like a success.
 */
export async function deleteContact(userId: string, id: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle<{ id: string }>();

  return Boolean(data);
}

export type Resolution =
  | { kind: "email"; email: string }
  | { kind: "contact"; email: string; name: string }
  | { kind: "none"; query: string }
  | { kind: "ambiguous"; query: string; matches: { name: string; email: string }[] };

/**
 * Turns whatever a person named for a recipient into an email address.
 *
 * Anything with an at sign is taken as an email as is. Otherwise it is looked up
 * in this account's contacts: an exact name match wins, then a single partial
 * match, and anything else comes back as none or ambiguous so the caller can ask
 * for clarification rather than guessing an address.
 */
export async function resolveRecipient(
  userId: string,
  input: string,
): Promise<Resolution> {
  const value = input.trim();
  if (value.includes("@")) {
    return { kind: "email", email: normaliseEmail(value) };
  }

  const contacts = await listContacts(userId);
  const lower = value.toLowerCase();

  const exact = contacts.filter((c) => c.name.toLowerCase() === lower);
  if (exact.length === 1) {
    return { kind: "contact", email: exact[0].email, name: exact[0].name };
  }
  if (exact.length > 1) {
    return {
      kind: "ambiguous",
      query: value,
      matches: exact.map((c) => ({ name: c.name, email: c.email })),
    };
  }

  const partial = contacts.filter((c) => c.name.toLowerCase().includes(lower));
  if (partial.length === 1) {
    return { kind: "contact", email: partial[0].email, name: partial[0].name };
  }
  if (partial.length > 1) {
    return {
      kind: "ambiguous",
      query: value,
      matches: partial.map((c) => ({ name: c.name, email: c.email })),
    };
  }

  return { kind: "none", query: value };
}
