"use client";

import { HandCoins } from "lucide-react";
import { useState, useTransition } from "react";

import { settleDebtsAction } from "./debts-actions";

export type DebtView = {
  key: string;
  label: string;
  netLabel: string;
  tone: "in" | "out" | "even";
  ids: string[];
};

/**
 * Open debts on this account, one quiet line per person with the net position
 * and a settle action. Marking settled here moves no money, it just clears the
 * record.
 */
export function DebtsCard({
  userId,
  initialDebts,
}: {
  userId: string;
  initialDebts: DebtView[];
}) {
  const [debts, setDebts] = useState(initialDebts);
  const [pending, start] = useTransition();

  function settle(key: string, ids: string[]) {
    start(async () => {
      const { settled } = await settleDebtsAction(userId, ids);
      if (settled > 0) setDebts((cur) => cur.filter((d) => d.key !== key));
    });
  }

  return (
    <section className="border-t border-border/60 pt-8">
      <h2 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
        Debts
      </h2>

      {debts.length === 0 ? (
        <p className="mt-4 flex items-center gap-2.5 text-sm text-muted-foreground">
          <HandCoins aria-hidden="true" className="size-4 text-subtle-foreground" />
          Nothing outstanding. Ask Claude to track a debt and it shows up here.
        </p>
      ) : (
        <ul className="mt-4">
          {debts.map((d) => (
            <li
              key={d.key}
              className="flex items-center justify-between gap-4 border-t border-border/50 py-3"
            >
              <p className="min-w-0 text-sm">
                <span className="text-muted-foreground">{d.label}</span>
                <span aria-hidden="true" className="mx-1.5 text-subtle-foreground">·</span>
                <span
                  className={
                    d.tone === "in"
                      ? "text-primary"
                      : d.tone === "out"
                        ? "text-foreground"
                        : "text-subtle-foreground"
                  }
                >
                  {d.netLabel}
                </span>
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => settle(d.key, d.ids)}
                className="ring-focus shrink-0 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-50"
              >
                Settle
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
