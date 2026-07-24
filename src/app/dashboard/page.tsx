import type { Metadata } from "next";
import { Inbox, SendHorizontal } from "lucide-react";

import { StatusChip } from "@/components/ui/status-chip";
import type { ActivityItem, DashboardData } from "@/lib/cue/dashboard";
import {
  getDashboardData,
  listDevUsers,
  resolveDashboardUser,
} from "@/lib/cue/dashboard";

import { AddMoneyButton } from "./add-money-button";
import { CancelButton } from "./cancel-button";
import { DevUserSwitcher } from "./dev-user-switcher";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Cue balance and activity.",
};

export const dynamic = "force-dynamic";

function formatRemaining(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ActivityRow({
  item,
  direction,
  viewerId,
}: {
  item: ActivityItem;
  direction: "out" | "in";
  viewerId: string;
}) {
  const showUnlock =
    item.status === "pending_claim" && item.secondsUntilUnlock > 0;
  const incoming = direction === "in";

  return (
    <li className="group relative flex items-start justify-between gap-3 rounded-lg px-3 py-3.5 transition-colors duration-150 hover:bg-secondary/45">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <p
            className={`tabular tracking-tightest text-[17px] font-semibold ${
              incoming ? "text-primary" : "text-foreground"
            }`}
          >
            {incoming ? "+" : "-"}${item.amount}
          </p>
          <StatusChip status={item.status} />
        </div>

        <p className="mt-1 truncate text-[13px] text-muted-foreground">
          {incoming ? "From" : "To"} {item.counterparty}
          {item.createdAt ? ` · ${formatDate(item.createdAt)}` : ""}
        </p>

        {showUnlock ? (
          <p className="tabular mt-1 text-xs text-subtle-foreground">
            {incoming
              ? `Unlocks in ${formatRemaining(item.secondsUntilUnlock)}`
              : `Can be collected in ${formatRemaining(item.secondsUntilUnlock)}`}
          </p>
        ) : null}
      </div>

      {item.canCancel ? (
        <CancelButton
          transactionId={item.id}
          senderUserId={viewerId}
          amount={item.amount}
          counterparty={item.counterparty}
        />
      ) : null}
    </li>
  );
}

function Section({
  title,
  icon: Icon,
  items,
  direction,
  viewerId,
  emptyTitle,
  emptyBody,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: ActivityItem[];
  direction: "out" | "in";
  viewerId: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-[11px] font-semibold tracking-[0.13em] text-subtle-foreground uppercase">
        {title}
      </h2>

      {items.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border px-6 py-9 text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex size-10 items-center justify-center rounded-full bg-secondary/70 text-subtle-foreground"
          >
            <Icon className="size-[18px]" />
          </span>
          <p className="mt-3.5 text-sm font-medium">{emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            {emptyBody}
          </p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border bg-card/40">
          {items.map((item) => (
            <ActivityRow
              key={item.id}
              item={item}
              direction={direction}
              viewerId={viewerId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BalanceCard({ data }: { data: DashboardData }) {
  return (
    <div className="relative">
      {/* Page glow, anchored behind the balance. */}
      <div className="glow -top-28 -left-24 h-[380px] w-[85%]" />

      <div className="surface-gradient relative overflow-hidden rounded-2xl border border-border-strong/70 bg-card p-6 shadow-[0_20px_60px_-28px_rgb(0_0_0/0.95)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Your balance</p>
            <p className="tabular tracking-tightest mt-2 flex items-baseline text-[3.25rem] leading-none font-semibold sm:text-[3.75rem]">
              <span className="mr-0.5 text-[0.5em] font-medium text-subtle-foreground">
                $
              </span>
              {data.balance}
            </p>
            <p className="mt-3 truncate text-xs text-subtle-foreground">
              {data.user.email}
            </p>
          </div>

          <AddMoneyButton />
        </div>

        {!data.hasAccount ? (
          <p className="mt-5 rounded-lg border border-border bg-elevated/60 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            This account is set up but has not received anything yet. Your
            balance appears here as soon as money arrives.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user: userParam } = await searchParams;
  const devUsers = await listDevUsers();
  const viewer = userParam ? await resolveDashboardUser(userParam) : null;

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="bg-dots bg-dots-fade pointer-events-none absolute inset-x-0 top-0 h-[400px]"
      />

      {/* Extra bottom padding keeps the floating dev switcher clear of content. */}
      <div className="relative mx-auto w-full max-w-3xl px-5 pt-12 pb-28 sm:px-8 sm:pt-16 sm:pb-24">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
          Dashboard
        </h1>

        {!viewer ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <p className="text-base font-medium">
              {userParam
                ? "We could not find that account"
                : "Pick an account to view"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {userParam
                ? "Nothing matches that address. Choose a known account from the switcher in the corner."
                : "Signing in arrives in a later release. Until then, use the account switcher in the corner to look around."}
            </p>
          </div>
        ) : (
          <DashboardBody viewer={viewer} />
        )}
      </div>

      <DevUserSwitcher users={devUsers} currentUserId={viewer?.id ?? null} />
    </div>
  );
}

async function DashboardBody({
  viewer,
}: {
  viewer: NonNullable<Awaited<ReturnType<typeof resolveDashboardUser>>>;
}) {
  const data = await getDashboardData(viewer);

  return (
    <>
      <div className="mt-6">
        <BalanceCard data={data} />
      </div>

      <Section
        title="Sent"
        icon={SendHorizontal}
        items={data.outgoing}
        direction="out"
        viewerId={viewer.id}
        emptyTitle="Nothing sent yet"
        emptyBody="Ask Claude to send money to an email address and it shows up here."
      />

      <Section
        title="Received"
        icon={Inbox}
        items={data.incoming}
        direction="in"
        viewerId={viewer.id}
        emptyTitle="Nothing received yet"
        emptyBody="When someone sends you money, it appears here once you collect it."
      />
    </>
  );
}
