import type { Metadata } from "next";
import { Activity, LogOut } from "lucide-react";

import { StatusText } from "@/components/ui/status-chip";
import { signOut } from "@/app/auth/actions";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { appUrl } from "@/lib/config";
import { listContacts } from "@/lib/cue/contacts";
import { listDebts } from "@/lib/cue/debts";
import { getUsage, type Usage } from "@/lib/cue/limits";
import { maskEmail, toAmountString } from "@/lib/cue/money";
import { formatRunDate, listSchedules, nextRunDate, ordinal } from "@/lib/cue/schedules";
import { getActiveToken } from "@/lib/mcp/tokens";
import type { ActivityItem, DashboardData } from "@/lib/cue/dashboard";
import { getDashboardData } from "@/lib/cue/dashboard";

import { AddMoneyButton } from "./add-money-button";
import { CancelButton } from "./cancel-button";
import { ConnectCard } from "./connect-card";
import { ContactsCard } from "./contacts-card";
import { DebtsCard } from "./debts-card";
import { SchedulesCard } from "./schedules-card";
import { SignInForm } from "./sign-in-form";

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="mesh-hero pointer-events-none absolute inset-x-0 top-0 h-[38vh] opacity-70"
      />
      <div aria-hidden="true" className="grain" />
      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
        {children}
      </div>
    </div>
  );
}

function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="ring-focus inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:border-border-strong hover:bg-secondary hover:text-foreground active:scale-[0.98]"
      >
        <LogOut aria-hidden="true" className="size-3.5" />
        Sign out
      </button>
    </form>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const incoming = item.direction === "in";
  const showUnlock = item.status === "pending_claim" && item.secondsUntilUnlock > 0;

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
            amount={item.amount}
            counterparty={item.counterparty}
          />
        ) : null}
      </div>
    </li>
  );
}

function BalanceBlock({ data, usage }: { data: DashboardData; usage: Usage }) {
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

      {usage.daily || usage.monthly ? (
        <div className="mt-3 space-y-0.5 text-[13px] text-subtle-foreground">
          {usage.daily ? (
            <p>
              Daily limit ${usage.daily.limit}
              <span aria-hidden="true" className="mx-1.5">·</span>
              <span className="tabular">${usage.daily.remaining}</span> left today
            </p>
          ) : null}
          {usage.monthly ? (
            <p>
              Monthly limit ${usage.monthly.limit}
              <span aria-hidden="true" className="mx-1.5">·</span>
              <span className="tabular">${usage.monthly.remaining}</span> left this month
            </p>
          ) : null}
        </div>
      ) : null}

      {!data.hasAccount ? (
        <p className="mt-4 text-xs leading-relaxed text-subtle-foreground">
          This account has not received anything yet. Your balance appears here as
          soon as money arrives.
        </p>
      ) : null}
    </section>
  );
}

function ActivitySection({ data }: { data: DashboardData }) {
  const groups = groupByDay(data.activity);
  return (
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
                  <ActivityRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Footer() {
  return (
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
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  const { signin } = await searchParams;
  const current = await getCurrentUser();

  if (!current) {
    return (
      <Shell>
        <SignedOut expired={signin === "expired"} />
        <Footer />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 truncate text-[13px] text-subtle-foreground">
            {current.scope === "full"
              ? current.user.email
              : `Collected to ${current.user.email}`}
          </p>
        </div>
        <SignOutButton />
      </div>

      {current.scope === "full" ? (
        <FullDashboard current={current} />
      ) : (
        <ScopedDashboard current={current} />
      )}

      <Footer />
    </Shell>
  );
}

function SignedOut({ expired }: { expired: boolean }) {
  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Cue</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Cue lets you send money by chatting with Claude. The person receiving it
        only needs an email address. Sign in to see your balance and activity, get
        your personal link for Claude, and set things up. No password: we email
        you a link.
      </p>

      {expired ? (
        <p className="mt-4 text-sm text-destructive">
          That sign in link has expired. Enter your email for a fresh one.
        </p>
      ) : null}

      <div className="mt-6">
        <SignInForm />
      </div>
    </section>
  );
}

async function ScopedDashboard({ current }: { current: CurrentUser }) {
  const data = await getDashboardData(current.user);
  const usage = await getUsage(current.user.id);

  return (
    <>
      <div className="mt-8">
        <BalanceBlock data={data} usage={usage} />
      </div>

      <ActivitySection data={data} />

      <section className="mt-12 border-t border-border/60 pt-8">
        <h2 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
          Sign in to do more
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          You collected money, so you can see your balance and activity. Sending,
          your connect link for Claude, spending limits, scheduled payments and
          debts need a full sign in to the same email.
        </p>
        <div className="mt-5">
          <SignInForm label="Sign in with your email to unlock everything" cta="Sign in" />
        </div>
      </section>
    </>
  );
}

async function FullDashboard({ current }: { current: CurrentUser }) {
  const viewer = current.user;
  const data = await getDashboardData(viewer);
  const usage = await getUsage(viewer.id);

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

  const people = await listDebts(viewer.id);
  const debtViews = people.map((p) => {
    const tone = p.net > 0 ? ("in" as const) : p.net < 0 ? ("out" as const) : ("even" as const);
    const netLabel =
      p.net > 0
        ? `owes you $${p.net.toFixed(2)}`
        : p.net < 0
          ? `you owe $${Math.abs(p.net).toFixed(2)}`
          : "settled up";
    return { key: p.email ?? `name:${p.label}`, label: p.label, netLabel, tone, ids: p.items.map((i) => i.id) };
  });

  return (
    <>
      <div className="mt-8">
        <BalanceBlock data={data} usage={usage} />
      </div>

      <ActivitySection data={data} />

      <div className="mt-12">
        <SchedulesCard initialSchedules={scheduleViews} />
      </div>

      <div className="mt-12">
        <DebtsCard initialDebts={debtViews} />
      </div>

      <div className="mt-12">
        <ContactsCard initialContacts={contactViews} />
      </div>

      <div className="mt-12">
        <ConnectCard initialUrl={connectUrl} />
      </div>
    </>
  );
}
