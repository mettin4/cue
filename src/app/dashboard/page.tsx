import type { Metadata } from "next";

import type { ActivityItem, DashboardData } from "@/lib/cue/dashboard";
import {
  getDashboardData,
  listDevUsers,
  resolveDashboardUser,
} from "@/lib/cue/dashboard";
import type { TransactionStatus } from "@/lib/cue/types";

import { AddMoneyButton } from "./add-money-button";
import { CancelButton } from "./cancel-button";
import { DevUserSwitcher } from "./dev-user-switcher";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Cue balance and activity.",
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<TransactionStatus, string> = {
  pending_claim: "Waiting to be collected",
  claimed: "Collected",
  cancelled: "Called back",
  failed: "Failed",
};

const STATUS_CLASS: Record<TransactionStatus, string> = {
  pending_claim: "bg-primary/10 text-primary",
  claimed: "bg-secondary text-foreground",
  cancelled: "bg-secondary text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};

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

function StatusChip({ status }: { status: TransactionStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
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

  return (
    <li className="flex items-start justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="tabular text-[15px] font-medium">
            {direction === "out" ? "-" : "+"}${item.amount}
          </p>
          <StatusChip status={item.status} />
        </div>

        <p className="mt-1 truncate text-sm text-muted-foreground">
          {direction === "out" ? "To" : "From"} {item.counterparty}
          {item.createdAt ? ` on ${formatDate(item.createdAt)}` : ""}
        </p>

        {showUnlock ? (
          <p className="tabular mt-1 text-xs text-muted-foreground">
            {direction === "out"
              ? `Can be collected in ${formatRemaining(item.secondsUntilUnlock)}`
              : `Unlocks in ${formatRemaining(item.secondsUntilUnlock)}`}
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
  items,
  direction,
  viewerId,
  emptyTitle,
  emptyBody,
}: {
  title: string;
  items: ActivityItem[];
  direction: "out" | "in";
  viewerId: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>

      {items.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">{emptyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{emptyBody}</p>
        </div>
      ) : (
        <ul className="mt-1">
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
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Your balance</p>
          <p className="tabular mt-1 text-4xl font-semibold sm:text-5xl">
            ${data.balance}
          </p>
          <p className="mt-2 truncate text-xs text-muted-foreground">
            {data.user.email}
          </p>
        </div>
        <AddMoneyButton />
      </div>

      {!data.hasAccount ? (
        <p className="mt-4 rounded-lg bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          This account is set up but has not received anything yet. Your balance
          appears here as soon as money arrives.
        </p>
      ) : null}
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
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <DevUserSwitcher users={devUsers} currentUserId={viewer?.id ?? null} />
      </div>

      {!viewer ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-base font-medium">
            {userParam ? "We could not find that account" : "Pick an account to view"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {userParam
              ? "Nothing matches that address. Choose a known account from the switcher above."
              : "Signing in arrives in a later release. Until then, use the account switcher above to look around."}
          </p>
        </div>
      ) : (
        <DashboardBody viewer={viewer} />
      )}
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
        items={data.outgoing}
        direction="out"
        viewerId={viewer.id}
        emptyTitle="Nothing sent yet"
        emptyBody="Ask Claude to send money to an email address and it shows up here."
      />

      <Section
        title="Received"
        items={data.incoming}
        direction="in"
        viewerId={viewer.id}
        emptyTitle="Nothing received yet"
        emptyBody="When someone sends you money, it appears here once you collect it."
      />
    </>
  );
}
