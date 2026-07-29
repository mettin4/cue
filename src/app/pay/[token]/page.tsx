import type { Metadata } from "next";
import Link from "next/link";
import { CircleSlash, LinkIcon, PartyPopper } from "lucide-react";

import { getRequestInfo } from "@/lib/cue/requests";

import { PayForm } from "./pay-form";

export const metadata: Metadata = {
  title: "Pay a Request",
  description: "Pay someone who asked you for money through Cue.",
};

// Request state changes over time, so never serve this from a static cache.
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="bg-dots bg-dots-fade pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      />

      <div className="relative mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-md flex-col justify-center px-5 py-14 sm:px-8 sm:py-16">
        <div className="relative">
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
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>

      <Link
        href="/"
        className="ring-focus mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-border px-5 text-sm font-medium transition-all duration-150 hover:border-border-strong hover:bg-secondary active:scale-[0.98]"
      >
        Learn About Cue
      </Link>
    </>
  );
}

export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const info = await getRequestInfo(token);

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

  if (info.status === "paid") {
    return (
      <Shell>
        <Notice
          icon={PartyPopper}
          tone="primary"
          title="Already paid"
          body={`The $${info.amount} for this request has already been paid. Nothing more to do here.`}
        />
      </Shell>
    );
  }

  if (info.status === "cancelled") {
    return (
      <Shell>
        <Notice
          icon={CircleSlash}
          title="This request was cancelled"
          body={`${info.requesterLabel} cancelled the request for $${info.amount}, so this link no longer works.`}
        />
      </Shell>
    );
  }

  if (info.status !== "pending") {
    return (
      <Shell>
        <Notice
          icon={CircleSlash}
          title="This request is closed"
          body="This request is no longer open for payment."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm text-muted-foreground">{info.requesterLabel} is asking you for</p>
      <p className="tabular tracking-tightest mt-2 text-[3.4rem] leading-none font-semibold text-primary [text-shadow:0_0_44px_rgb(56_211_137/0.35)]">
        ${info.amount}
      </p>

      <PayForm
        payToken={token}
        amount={info.amount}
        requesterLabel={info.requesterLabel}
      />
    </Shell>
  );
}
