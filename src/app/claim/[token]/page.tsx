import type { Metadata } from "next";
import Link from "next/link";

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
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-5 py-14 sm:px-8 sm:py-24">
      <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        {children}
      </div>
    </div>
  );
}

function Notice({
  title,
  body,
  tone = "muted",
}: {
  title: string;
  body: string;
  tone?: "muted" | "primary";
}) {
  return (
    <>
      <h1
        className={`text-xl font-semibold ${tone === "primary" ? "text-primary" : ""}`}
      >
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        Learn About Cue
      </Link>
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
        <p className="text-sm text-muted-foreground">
          {info.senderLabel} sent you
        </p>
        <p className="tabular mt-2 text-5xl font-semibold">${info.amount}</p>

        <div className="mt-5 rounded-xl border border-border bg-background p-4">
          <Countdown initialSeconds={info.secondsUntilUnlock} />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
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
      <p className="text-sm text-muted-foreground">
        {info.senderLabel} sent you
      </p>
      <p className="tabular mt-2 text-5xl font-semibold">${info.amount}</p>

      <CollectForm claimToken={token} amount={info.amount} />
    </Shell>
  );
}
