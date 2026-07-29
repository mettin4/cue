"use client";

import { CalendarClock, Pause, Play, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import {
  deleteScheduleAction,
  pauseScheduleAction,
  resumeScheduleAction,
} from "./schedules-actions";

export type ScheduleView = {
  id: string;
  masked: string;
  amount: string;
  dayLabel: string;
  nextRun: string;
  active: boolean;
};

/**
 * Shows the recurring payments set up on this account, with controls to pause,
 * resume or delete each one. Recipients are masked, the same as everywhere else
 * a public page renders an address.
 */
export function SchedulesCard({
  userId,
  initialSchedules,
}: {
  userId: string;
  initialSchedules: ScheduleView[];
}) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [pending, start] = useTransition();

  function pause(id: string) {
    start(async () => {
      const { ok } = await pauseScheduleAction(userId, id);
      if (ok) setSchedules((cur) => cur.map((s) => (s.id === id ? { ...s, active: false } : s)));
    });
  }

  function resume(id: string) {
    start(async () => {
      const { ok } = await resumeScheduleAction(userId, id);
      if (ok) setSchedules((cur) => cur.map((s) => (s.id === id ? { ...s, active: true } : s)));
    });
  }

  function remove(id: string) {
    start(async () => {
      const { ok } = await deleteScheduleAction(userId, id);
      if (ok) setSchedules((cur) => cur.filter((s) => s.id !== id));
    });
  }

  return (
    <section className="border-t border-border/60 pt-8">
      <h2 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
        Scheduled Payments
      </h2>

      {schedules.length === 0 ? (
        <p className="mt-4 flex items-center gap-2.5 text-sm text-muted-foreground">
          <CalendarClock aria-hidden="true" className="size-4 text-subtle-foreground" />
          No recurring payments. Ask Claude to set one up and it shows up here.
        </p>
      ) : (
        <ul className="mt-4">
          {schedules.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/50 py-3.5"
            >
              <div className="min-w-0">
                <p className="flex items-baseline gap-2 text-sm">
                  <span className="tabular font-display font-semibold tracking-tightest text-foreground">
                    ${s.amount}
                  </span>
                  <span className="text-muted-foreground">to {s.masked}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-subtle-foreground">
                  {s.dayLabel} of each month
                  <span aria-hidden="true" className="mx-1.5">·</span>
                  {s.active ? `next on ${s.nextRun}` : "paused"}
                </p>
              </div>

              <div className="flex items-center gap-3 text-[13px]">
                {s.active ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => pause(s.id)}
                    className="ring-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-50"
                  >
                    <Pause aria-hidden="true" className="size-3.5" />
                    Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => resume(s.id)}
                    className="ring-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-primary transition-colors duration-150 hover:text-[#45e096] disabled:opacity-50"
                  >
                    <Play aria-hidden="true" className="size-3.5" />
                    Resume
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(s.id)}
                  aria-label={`Delete the payment to ${s.masked}`}
                  className="ring-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors duration-150 hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
