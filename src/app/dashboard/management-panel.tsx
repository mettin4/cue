"use client";

import { Pause, Play, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteContactAction } from "./contacts-actions";
import { settleDebtsAction } from "./debts-actions";
import { deleteScheduleAction, pauseScheduleAction, resumeScheduleAction } from "./schedules-actions";

export type ScheduleView = { id: string; masked: string; amount: string; dayLabel: string; nextRun: string; active: boolean };
export type DebtView = { key: string; label: string; netLabel: string; tone: "in" | "out" | "even"; ids: string[] };
export type ContactView = { id: string; name: string; masked: string };

function SubHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">{title}</h3>
      {count > 0 ? <span className="tabular text-[11px] text-subtle-foreground">{count}</span> : null}
    </div>
  );
}

/**
 * Schedules, debts and contacts in one panel instead of three bands of empty
 * space. When all three are empty it collapses to a single compact summary;
 * each section only expands into a list when it has something to show.
 */
export function ManagementPanel({
  schedules: initialSchedules,
  debts: initialDebts,
  contacts: initialContacts,
  className,
}: {
  schedules: ScheduleView[];
  debts: DebtView[];
  contacts: ContactView[];
  className?: string;
}) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [debts, setDebts] = useState(initialDebts);
  const [contacts, setContacts] = useState(initialContacts);
  const [pending, start] = useTransition();

  const allEmpty = schedules.length === 0 && debts.length === 0 && contacts.length === 0;

  function pause(id: string) {
    start(async () => {
      const { ok } = await pauseScheduleAction(id);
      if (ok) setSchedules((c) => c.map((s) => (s.id === id ? { ...s, active: false } : s)));
    });
  }
  function resume(id: string) {
    start(async () => {
      const { ok } = await resumeScheduleAction(id);
      if (ok) setSchedules((c) => c.map((s) => (s.id === id ? { ...s, active: true } : s)));
    });
  }
  function removeSchedule(id: string) {
    start(async () => {
      const { ok } = await deleteScheduleAction(id);
      if (ok) setSchedules((c) => c.filter((s) => s.id !== id));
    });
  }
  function settle(key: string, ids: string[]) {
    start(async () => {
      const { settled } = await settleDebtsAction(ids);
      if (settled > 0) setDebts((c) => c.filter((d) => d.key !== key));
    });
  }
  function removeContact(id: string) {
    start(async () => {
      const { ok } = await deleteContactAction(id);
      if (ok) setContacts((c) => c.filter((x) => x.id !== id));
    });
  }

  return (
    <section className={`surface-gradient h-full rounded-2xl border border-border bg-card p-6 sm:p-7 ${className ?? ""}`}>
      <p className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
        Automations and records
      </p>

      {allEmpty ? (
        <div className="mt-4">
          <dl className="space-y-2">
            {[
              ["Scheduled payments", "None yet"],
              ["Debts", "None tracked"],
              ["Contacts", "None saved"],
            ].map(([label, note]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-[13px] text-subtle-foreground">{note}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13px] leading-relaxed text-subtle-foreground">
            Ask Claude to schedule a payment, track a debt or save a contact, and it appears here.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-7">
          {/* Scheduled payments */}
          <div>
            <SubHead title="Scheduled payments" count={schedules.length} />
            {schedules.length === 0 ? (
              <p className="mt-2 text-[13px] text-subtle-foreground">None yet.</p>
            ) : (
              <ul className="mt-2">
                {schedules.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border/50 py-3 first:border-t-0 first:pt-1">
                    <div className="min-w-0">
                      <p className="flex items-baseline gap-2 text-sm">
                        <span className="tabular font-display font-semibold tracking-tightest text-foreground">${s.amount}</span>
                        <span className="text-muted-foreground">to {s.masked}</span>
                      </p>
                      <p className="mt-0.5 text-[13px] text-subtle-foreground">
                        {s.dayLabel} of each month
                        <span aria-hidden="true" className="mx-1.5">·</span>
                        {s.active ? `next on ${s.nextRun}` : "paused"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[13px]">
                      {s.active ? (
                        <button type="button" disabled={pending} onClick={() => pause(s.id)} className="ring-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-50">
                          <Pause aria-hidden="true" className="size-3.5" /> Pause
                        </button>
                      ) : (
                        <button type="button" disabled={pending} onClick={() => resume(s.id)} className="ring-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-primary transition-colors duration-150 hover:text-[#45e096] disabled:opacity-50">
                          <Play aria-hidden="true" className="size-3.5" /> Resume
                        </button>
                      )}
                      <button type="button" disabled={pending} onClick={() => removeSchedule(s.id)} aria-label={`Delete the payment to ${s.masked}`} className="ring-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors duration-150 hover:text-destructive disabled:opacity-50">
                        <Trash2 aria-hidden="true" className="size-3.5" /> Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Debts */}
          <div>
            <SubHead title="Debts" count={debts.length} />
            {debts.length === 0 ? (
              <p className="mt-2 text-[13px] text-subtle-foreground">None tracked.</p>
            ) : (
              <ul className="mt-2">
                {debts.map((d) => (
                  <li key={d.key} className="flex items-center justify-between gap-4 border-t border-border/50 py-3 first:border-t-0 first:pt-1">
                    <p className="min-w-0 text-sm">
                      <span className="text-muted-foreground">{d.label}</span>
                      <span aria-hidden="true" className="mx-1.5 text-subtle-foreground">·</span>
                      <span className={d.tone === "in" ? "text-primary" : d.tone === "out" ? "text-foreground" : "text-subtle-foreground"}>{d.netLabel}</span>
                    </p>
                    <button type="button" disabled={pending} onClick={() => settle(d.key, d.ids)} className="ring-focus shrink-0 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-50">
                      Settle
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Contacts */}
          <div>
            <SubHead title="Contacts" count={contacts.length} />
            {contacts.length === 0 ? (
              <p className="mt-2 text-[13px] text-subtle-foreground">None saved.</p>
            ) : (
              <ul className="mt-2">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 border-t border-border/50 py-3 first:border-t-0 first:pt-1">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                      <p className="truncate text-[13px] text-subtle-foreground">{c.masked}</p>
                    </div>
                    <button type="button" disabled={pending} onClick={() => removeContact(c.id)} aria-label={`Remove ${c.name}`} className="ring-focus inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-destructive disabled:opacity-50">
                      <Trash2 aria-hidden="true" className="size-3.5" /> Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
