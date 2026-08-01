import type { ReactNode } from "react";

import { StatusText } from "@/components/ui/status-chip";
import type { ActivityItem, DashboardStats } from "@/lib/cue/dashboard";
import type { Usage } from "@/lib/cue/limits";

import { CancelButton } from "./cancel-button";

/**
 * Shared surfaces for the dashboard. Kept free of server imports so the same
 * pieces render in the real page and in the screenshot preview. Every panel is a
 * near black raised card with a hairline border, so the screen reads as composed
 * blocks rather than faint headings on black.
 */

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`surface-gradient h-full rounded-2xl border border-border bg-card p-6 sm:p-7 ${className ?? ""}`}>
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">{children}</p>
  );
}

function formatRemaining(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h left`;
  if (minutes > 0) return `${minutes}m left`;
  return `${totalSeconds}s left`;
}

function formatDay(value: string | null): string {
  if (!value) return "Earlier";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(value),
  );
}

function groupByDay(items: ActivityItem[]): { day: string; items: ActivityItem[] }[] {
  const groups: { day: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const day = formatDay(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

export function BalancePanel({
  balance,
  stats,
  usage,
  hasAccount,
  action,
  className,
}: {
  balance: string;
  stats: DashboardStats;
  usage: Usage;
  hasAccount: boolean;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={`flex flex-col ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-4">
        <Eyebrow>Balance</Eyebrow>
        {action}
      </div>

      <div className="flex flex-1 flex-col justify-center py-2">
      <p className="tabular font-display mt-3 text-[clamp(3rem,6vw,4.25rem)] leading-[0.95] font-semibold tracking-tightest text-primary">
        ${balance}
      </p>

      <p className="mt-4 text-sm text-muted-foreground">
        Sent <span className="tabular text-foreground">${stats.totalSent}</span>
        <span aria-hidden="true" className="mx-2 text-subtle-foreground">·</span>
        Received <span className="tabular text-foreground">${stats.totalReceived}</span>
        <span aria-hidden="true" className="mx-2 text-subtle-foreground">·</span>
        <span className="tabular text-foreground">{stats.pendingCount}</span> pending
      </p>

      {usage.daily || usage.monthly ? (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-subtle-foreground">
          {usage.daily ? (
            <span>
              Daily limit ${usage.daily.limit}
              <span aria-hidden="true" className="mx-1.5">·</span>
              <span className="tabular text-muted-foreground">${usage.daily.remaining}</span> left today
            </span>
          ) : null}
          {usage.monthly ? (
            <span>
              Monthly limit ${usage.monthly.limit}
              <span aria-hidden="true" className="mx-1.5">·</span>
              <span className="tabular text-muted-foreground">${usage.monthly.remaining}</span> left this month
            </span>
          ) : null}
        </div>
      ) : null}

      {!hasAccount ? (
        <p className="mt-4 text-xs leading-relaxed text-subtle-foreground">
          Nothing has arrived yet. Your balance appears here the moment money does.
        </p>
      ) : null}
      </div>
    </Panel>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const incoming = item.direction === "in";
  const funded = item.kind === "funding";
  const showUnlock = item.status === "pending_claim" && item.secondsUntilUnlock > 0;

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border/50 py-3.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span
          className={`tabular font-display text-lg font-semibold tracking-tightest ${
            incoming ? "text-primary" : "text-foreground"
          }`}
        >
          {incoming ? "+" : "-"}${item.amount}
        </span>
        {funded ? (
          <span className="text-[13px] text-subtle-foreground">Added</span>
        ) : (
          <StatusText status={item.status} className="text-[13px]" />
        )}
      </div>

      <div className="flex items-baseline gap-3 text-[13px] text-subtle-foreground">
        <span>
          {funded
            ? "Test funds"
            : `${incoming ? "from" : "to"} ${item.counterparty}${
                showUnlock ? ` · ${formatRemaining(item.secondsUntilUnlock)}` : ""
              }`}
        </span>
        {!funded && item.canCancel ? (
          <CancelButton transactionId={item.id} amount={item.amount} counterparty={item.counterparty} />
        ) : null}
      </div>
    </li>
  );
}

export function ActivityPanel({ activity, className }: { activity: ActivityItem[]; className?: string }) {
  const groups = groupByDay(activity);
  return (
    <Panel className={className}>
      <Eyebrow>Activity</Eyebrow>
      {activity.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Nothing yet. Ask Claude to send money and it shows up here, in real time.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map((group) => (
            <div key={group.day}>
              <p className="text-[11px] font-medium tracking-wide text-subtle-foreground uppercase">
                {group.day}
              </p>
              <ul className="mt-2">
                {group.items.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
