"use client";

import { Trash2, Users } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteContactAction } from "./contacts-actions";

export type ContactView = { id: string; name: string; masked: string };

/**
 * Shows the contacts Cue has stored for this account and lets them be removed,
 * so a person can see and clear what is kept about them. Emails are masked, the
 * same as everywhere else a public page renders one.
 */
export function ContactsCard({ initialContacts }: { initialContacts: ContactView[] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [pending, start] = useTransition();

  function remove(id: string) {
    start(async () => {
      const { ok } = await deleteContactAction(id);
      if (ok) setContacts((current) => current.filter((c) => c.id !== id));
    });
  }

  return (
    <section className="border-t border-border/60 pt-8">
      <h2 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
        Contacts
      </h2>

      {contacts.length === 0 ? (
        <p className="mt-4 flex items-center gap-2.5 text-sm text-muted-foreground">
          <Users aria-hidden="true" className="size-4 text-subtle-foreground" />
          No saved contacts. Ask Claude to save one and it shows up here.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            People Cue has saved for this account. Remove any you no longer want kept.
          </p>
          <ul className="mt-4">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="flex items-center justify-between gap-4 border-t border-border/50 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {contact.name}
                  </p>
                  <p className="truncate text-[13px] text-subtle-foreground">
                    {contact.masked}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(contact.id)}
                  aria-label={`Remove ${contact.name}`}
                  className="ring-focus inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
