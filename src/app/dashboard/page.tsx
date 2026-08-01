import type { Metadata } from "next";
import { LogOut } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { appUrl, fundAmountUsdc } from "@/lib/config";
import { listContacts } from "@/lib/cue/contacts";
import { listDebts } from "@/lib/cue/debts";
import { getUsage } from "@/lib/cue/limits";
import { maskEmail, toAmountString } from "@/lib/cue/money";
import { formatRunDate, listSchedules, nextRunDate, ordinal } from "@/lib/cue/schedules";
import { getActiveToken } from "@/lib/mcp/tokens";
import { getDashboardData } from "@/lib/cue/dashboard";

import { AddMoneyButton } from "./add-money-button";
import { ConnectPanel } from "./connect-card";
import { ManagementPanel } from "./management-panel";
import { ActivityPanel, BalancePanel } from "./panels";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Cue balance and activity.",
};

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden="true" className="mesh-hero pointer-events-none absolute inset-x-0 top-0 h-[34vh] opacity-60" />
      <div aria-hidden="true" className="grain" />
      <div className="relative z-10 mx-auto w-full max-w-[1080px] px-5 py-10 sm:px-8 sm:py-14">
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

function Header({ current }: { current: CurrentUser }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 truncate text-[13px] text-subtle-foreground">
          {current.scope === "full" ? current.user.email : `Collected to ${current.user.email}`}
        </p>
      </div>
      <SignOutButton />
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-10 space-y-2 border-t border-border/50 pt-7 text-[13px] leading-relaxed text-subtle-foreground">
      <p>This is a testnet demo. No real money is involved.</p>
      <p>
        Money stays in the sender&apos;s account until it is collected, and the sender can call any send
        back during the first hour.
      </p>
      <p>Built by Team MTH.</p>
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
      <Header current={current} />
      {current.scope === "full" ? <FullDashboard current={current} /> : <ScopedDashboard current={current} />}
      <Footer />
    </Shell>
  );
}

function SignedOut({ expired }: { expired: boolean }) {
  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Cue</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Cue lets you send money by chatting with Claude. The person receiving it only needs an email
        address. Sign in to see your balance and activity, get your personal link for Claude, and set
        things up. No password: we email you a link.
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
    <div className="mt-8 space-y-5">
      <BalancePanel balance={data.balance} stats={data.stats} usage={usage} hasAccount={data.hasAccount} />
      <ActivityPanel activity={data.activity} />

      <section className="surface-gradient rounded-2xl border border-border bg-card p-6 sm:p-7">
        <p className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
          Sign in to do more
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          You collected money, so you can see your balance and activity. Sending, your connect link for
          Claude, spending limits, scheduled payments and debts need a full sign in to the same email.
        </p>
        <div className="mt-5">
          <SignInForm label="Sign in with your email to unlock everything" cta="Sign in" />
        </div>
      </section>
    </div>
  );
}

async function FullDashboard({ current }: { current: CurrentUser }) {
  const viewer = current.user;
  const data = await getDashboardData(viewer);
  const usage = await getUsage(viewer.id);

  const token = await getActiveToken(viewer.id);
  const connectUrl = token ? `${appUrl()}/api/mcp/${token.token}` : null;
  const connected = Boolean(token?.last_used_at);

  const contacts = await listContacts(viewer.id);
  const contactViews = contacts.map((c) => ({ id: c.id, name: c.name, masked: maskEmail(c.email) }));

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
    <div className="mt-8 grid gap-5 lg:grid-cols-12">
      <BalancePanel
        className="lg:col-span-7"
        balance={data.balance}
        stats={data.stats}
        usage={usage}
        hasAccount={data.hasAccount}
        action={<AddMoneyButton amount={fundAmountUsdc().toFixed(2)} />}
      />
      <ConnectPanel className="lg:col-span-5" connected={connected} initialUrl={connectUrl} />
      <ActivityPanel className="lg:col-span-7" activity={data.activity} />
      <ManagementPanel className="lg:col-span-5" schedules={scheduleViews} debts={debtViews} contacts={contactViews} />
    </div>
  );
}
