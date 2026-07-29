import type { Metadata } from "next";
import { Activity } from "lucide-react";

import { StatusText } from "@/components/ui/status-chip";
import { appUrl } from "@/lib/config";
import { listContacts } from "@/lib/cue/contacts";
import { maskEmail, toAmountString } from "@/lib/cue/money";
import { formatRunDate, listSchedules, nextRunDate, ordinal } from "@/lib/cue/schedules";
import { getActiveToken } from "@/lib/mcp/tokens";
import type { ActivityItem, DashboardData } from "@/lib/cue/dashboard";
import {
  getDashboardData,
  listDevUsers,
  pickDemoUser,
  resolveDashboardUser,
} from "@/lib/cue/dashboard";

import { AddMoneyButton } from "./add-money-button";
import { CancelButton } from "./cancel-button";
import { ConnectCard } from "./connect-card";
import { ContactsCard } from "./contacts-card";
import { DevUserSwitcher } from "./dev-user-switcher";
import { SchedulesCard } from "./schedules-card";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Cue balance and activity.",
};

export const dynamic = "force-dynamic";

function formatRemaining(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h left`;
  if (minutes > 0) return `${minutes}m left`;
  return `${totalSeconds}s left`;
}

function formatDay(value: string | null): string {
  if (!value) return "Earlier";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
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

function ActivityRow({
  item,
  viewerId,
}: {
  item: ActivityItem;
  viewerId: string;
}) {
  const incoming = item.direction === "in";
  const showUnlock =
    item.status === "pending_claim" && item.secondsUntilUnlock > 0;

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border/50 py-3.5">
      <div className="flex items-baseline gap-3">
        <span
          className={`tabular font-display text-lg font-semibold tracking-tightest ${
            incoming ? "text-primary" : "text-foreground"
          }`}
        >
          {incoming ? "+" : "-"}${item.amount}
        </span>
        <StatusText status={item.status} className="text-[13px]" />
      </div>

      <div className="flex items-baseline gap-3 text-[13px] text-subtle-foreground">
        <span>
          {incoming ? "from" : "to"} {item.counterparty}
          {showUnlock ? ` · ${formatRemaining(item.secondsUntilUnlock)}` : ""}
        </span>
        {item.canCancel ? (
          <CancelButton
            transactionId={item.id}
            senderUserId={viewerId}
            amount={item.amount}
            counterparty={item.counterparty}
          />
        ) : null}
      </div>
    </li>
  );
}

function BalanceBlock({ data }: { data: DashboardData }) {
  const stats = data.stats;
  return (
    <section>
      <p className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
        Balance
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <p className="tabular font-display text-[clamp(3rem,7vw,4.5rem)] leading-[0.95] font-semibold tracking-tightest text-primary">
          ${data.balance}
        </p>
        <div className="pb-1">
          <AddMoneyButton />
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Sent <span className="tabular text-primary">${stats.totalSent}</span>
        <span aria-hidden="true" className="mx-2 text-subtle-foreground">·</span>
        Received <span className="tabular text-primary">${stats.totalReceived}</span>
        <span aria-hidden="true" className="mx-2 text-subtle-foreground">·</span>
        <span className="tabular text-primary">{stats.pendingCount}</span> pending
      </p>

      {!data.hasAccount ? (
        <p className="mt-4 text-xs leading-relaxed text-subtle-foreground">
          This account has not received anything yet. Your balance appears here
          as soon as money arrives.
        </p>
      ) : null}
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user: userParam } = await searchParams;
  const devUsers = await listDevUsers();

  // Never a dead end: fall back to the most active account as a demo view.
  let viewer = userParam ? await resolveDashboardUser(userParam) : null;
  const isDemo = !viewer;
  if (!viewer) viewer = await pickDemoUser();

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="mesh-hero pointer-events-none absolute inset-x-0 top-0 h-[38vh] opacity-70"
      />
      <div aria-hidden="true" className="grain" />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          {viewer ? (
            <DevUserSwitcher
              users={devUsers.map((u) => ({
                id: u.id,
                label: u.role,
                masked: maskEmail(u.email),
              }))}
              currentUserId={viewer.id}
            />
          ) : null}
        </div>

        {isDemo && viewer ? (
          <p className="mt-1.5 text-[13px] text-subtle-foreground">
            Demo view until sign in ships.
          </p>
        ) : null}

        {!viewer ? (
          <p className="mt-8 text-sm text-muted-foreground">
            No accounts exist yet.
          </p>
        ) : (
          <DashboardBody viewer={viewer} />
        )}
      </div>
    </div>
  );
}

async function DashboardBody({
  viewer,
}: {
  viewer: NonNullable<Awaited<ReturnType<typeof resolveDashboardUser>>>;
}) {
  const data = await getDashboardData(viewer);
  const groups = groupByDay(data.activity);

  const token = await getActiveToken(viewer.id);
  const connectUrl = token ? `${appUrl()}/api/mcp/${token.token}` : null;

  const contacts = await listContacts(viewer.id);
  const contactViews = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    masked: maskEmail(c.email),
  }));

  const schedules = await listSchedules(viewer.id);
  const scheduleViews = schedules.map((s) => ({
    id: s.id,
    masked: maskEmail(s.recipient_email),
    amount: toAmountString(s.amount_usdc),
    dayLabel: ordinal(s.day_of_month),
    nextRun: formatRunDate(nextRunDate(s.day_of_month, s.last_run_at)),
    active: s.active,
  }));

  return (
    <>
      <div className="mt-8">
        <BalanceBlock data={data} />
      </div>

      <section className="mt-12">
        <h2 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
          Activity
        </h2>

        {data.activity.length === 0 ? (
          <p className="mt-4 flex items-center gap-2.5 text-sm text-muted-foreground">
            <Activity aria-hidden="true" className="size-4 text-subtle-foreground" />
            Nothing yet. Ask Claude to send money and it shows up here.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {groups.map((group) => (
              <div key={group.day}>
                <p className="text-[11px] font-medium tracking-wide text-subtle-foreground uppercase">
                  {group.day}
                </p>
                <ul className="mt-1">
                  {group.items.map((item) => (
                    <ActivityRow key={item.id} item={item} viewerId={viewer.id} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-12">
        <SchedulesCard userId={viewer.id} initialSchedules={scheduleViews} />
      </div>

      <div className="mt-12">
        <ContactsCard userId={viewer.id} initialContacts={contactViews} />
      </div>

      <div className="mt-12">
        <ConnectCard userId={viewer.id} initialUrl={connectUrl} />
      </div>

      <div className="mt-12 space-y-2 border-t border-border/60 pt-8 text-[13px] leading-relaxed text-subtle-foreground">
        <p>This is a testnet demo. No real money is involved.</p>
        <p>
          Money stays in the sender&apos;s account until it is collected, and the
          sender can call any send back during the first hour.
        </p>
        <p>
          Built by Team MTH.{" "}
          <a
            href="https://github.com/mettin4/cue"
            target="_blank"
            rel="noopener noreferrer"
            className="ring-focus rounded underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
          >
            Source
          </a>
        </p>
      </div>
    </>
  );
}
