import type { Metadata } from "next";
import Link from "next/link";
import { CircleSlash, Clock, LinkIcon, PartyPopper } from "lucide-react";

import { getClaimInfo } from "@/lib/cue/claim";

import { CollectForm } from "./collect-form";
import { Countdown } from "./countdown";

export const metadata: Metadata = {
  title: "Collect Your Money",
  description: "Collect the money someone sent you through Cue.",
};

// Claim state changes over time, so never serve this from a static cache.
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="bg-dots bg-dots-fade pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      />

      {/* Optically centred rather than pinned to the top, so the card is the
          subject of the page instead of floating above a void. */}
      <div className="relative mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-md flex-col justify-center px-5 py-14 sm:px-8 sm:py-16">
        <div className="relative">
          {/* One glow, behind the card. */}
          <div className="glow -top-24 -left-16 h-[420px] w-[calc(100%+8rem)]" />

          <div className="surface-gradient relative rounded-2xl border border-border-strong/70 bg-card/90 p-7 text-center shadow-[0_24px_70px_-24px_rgb(0_0_0/0.9)] backdrop-blur-sm sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Notice({
  icon: Icon,
  title,
  body,
  tone = "muted",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  tone?: "muted" | "primary";
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`mx-auto flex size-12 items-center justify-center rounded-full ring-1 ${
          tone === "primary"
            ? "bg-primary/12 text-primary ring-primary/25"
            : "bg-secondary text-muted-foreground ring-border-strong/60"
        }`}
      >
        <Icon className="size-5" />
      </span>

      <h1 className="mt-5 text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>

      <Link
        href="/"
        className="ring-focus mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-border px-5 text-sm font-medium transition-all duration-150 hover:border-border-strong hover:bg-secondary active:scale-[0.98]"
      >
        Learn About Cue
      </Link>
    </>
  );
}

function AmountHero({
  senderLabel,
  amount,
  mint = false,
}: {
  senderLabel: string;
  amount: string;
  mint?: boolean;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">{senderLabel} sent you</p>
      <p
        className={`tabular tracking-tightest mt-2 text-[3.4rem] leading-none font-semibold ${
          mint
            ? "text-primary [text-shadow:0_0_44px_rgb(56_211_137/0.35)]"
            : "text-gradient-mint"
        }`}
      >
        ${amount}
      </p>
    </>
  );
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const info = await getClaimInfo(token);

  if (!info) {
    return (
      <Shell>
        <Notice
          icon={LinkIcon}
          title="This link is not valid"
          body="Double check the link from your email. If it was forwarded or edited it may not work."
        />
      </Shell>
    );
  }

  if (info.status === "claimed") {
    return (
      <Shell>
        <Notice
          icon={PartyPopper}
          tone="primary"
          title="Already collected"
          body={`The $${info.amount} from this link has already been collected. Nothing more to do here.`}
        />
      </Shell>
    );
  }

  if (info.status === "cancelled") {
    return (
      <Shell>
        <Notice
          icon={CircleSlash}
          title="This was called back"
          body={`${info.senderLabel} called back the $${info.amount} before it was collected, so this link no longer works.`}
        />
      </Shell>
    );
  }

  if (info.status !== "pending_claim") {
    return (
      <Shell>
        <Notice
          icon={CircleSlash}
          title="Something went wrong"
          body="This transfer did not go through. The sender can try again."
        />
      </Shell>
    );
  }

  // Still inside the sender's window.
  if (!info.claimable) {
    return (
      <Shell>
        <AmountHero senderLabel={info.senderLabel} amount={info.amount} />

        <div className="mt-6 rounded-xl border border-border bg-elevated/70 p-4">
          <Countdown initialSeconds={info.secondsUntilUnlock} />

          <p className="mt-2.5 flex items-start gap-2 text-left text-xs leading-relaxed text-subtle-foreground">
            <Clock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Every send holds for a short window first. Until it ends the sender
            can still call the money back. Come back to this page once the time
            is up.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <AmountHero senderLabel={info.senderLabel} amount={info.amount} mint />
      <CollectForm claimToken={token} amount={info.amount} />
    </Shell>
  );
}
