import Link from "next/link";
import { ArrowRight, MailCheck, MessagesSquare, Undo2 } from "lucide-react";

import { SiteFooter } from "@/components/site/footer";
import { LiveDot } from "@/components/ui/status-chip";

const FEATURES = [
  {
    icon: MessagesSquare,
    title: "Send by Chatting",
    body: "Tell Claude who to pay and how much. No forms, no account numbers, no app to open.",
  },
  {
    icon: MailCheck,
    title: "Only an Email Needed",
    body: "They get a link, enter their email and collect. Nothing to install and nothing to set up first.",
  },
  {
    icon: Undo2,
    title: "Call It Back",
    body: "Every send holds for an hour before it unlocks. Change your mind and take it back instantly.",
  },
];

function ChatMock() {
  return (
    <div
      aria-label="Example conversation with Claude"
      role="img"
      className="relative rounded-2xl border border-border-strong/70 bg-card/90 p-4 shadow-[0_24px_70px_-20px_rgb(0_0_0/0.9)] backdrop-blur-sm sm:p-5"
    >
      {/* Outgoing message */}
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-[15px] break-words">
          Send Jack 50 dollars, jack@gmail.com
        </p>
      </div>

      {/* Claude reply */}
      <div className="mt-5 flex gap-3">
        <span
          aria-hidden="true"
          className="font-display mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[13px] font-semibold text-primary ring-1 ring-primary/25"
        >
          C
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Done. Jack has an hour to wait before it unlocks, so you can still
            call it back.
          </p>

          {/* Payment card: the anchor object of the whole page. */}
          <div className="surface-gradient relative mt-3.5 overflow-hidden rounded-xl border border-primary/25 bg-elevated p-4 shadow-[0_0_0_1px_rgb(56_211_137/0.06),0_18px_40px_-24px_rgb(56_211_137/0.45)]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-medium tracking-[0.14em] text-subtle-foreground uppercase">
                Sent
              </span>
              <span className="tabular tracking-tightest text-3xl font-semibold text-primary">
                $50.00
              </span>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">To</dt>
                <dd className="min-w-0 truncate">jack@gmail.com</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="flex items-center gap-2 text-warning">
                  <LiveDot />
                  <span className="text-foreground">Waiting to be collected</span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="bg-dots bg-dots-fade pointer-events-none absolute inset-x-0 top-0 h-[620px]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Hero fills the first screen on desktop, two columns side by side. */}
        {/* Sized close to the content it holds so the feature row sits just
            below the fold rather than after a stretch of dead space. */}
        <section className="grid items-center gap-12 pt-12 pb-10 lg:min-h-[30rem] lg:grid-cols-[1fr_1.08fr] lg:gap-16 lg:pt-8 lg:pb-0">
          <div>
            <h1 className="tracking-tightest text-[2.6rem] leading-[1.04] font-semibold sm:text-6xl lg:text-[4rem]">
              Write to Claude,
              <br />
              <span className="text-gradient-mint">money moves.</span>
            </h1>

            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-lg">
              Ask Claude to send money to any email address. The person on the
              other end collects it in two taps.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="ring-focus group inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[0_8px_30px_-10px_rgb(56_211_137/0.7)] transition-all duration-150 hover:bg-[#45e096] hover:shadow-[0_10px_36px_-10px_rgb(56_211_137/0.85)] active:scale-[0.98]"
              >
                Open Dashboard
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </Link>

              <a
                href="https://github.com/mettin4/cue"
                target="_blank"
                rel="noopener noreferrer"
                className="ring-focus inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card/60 px-6 text-sm font-medium transition-all duration-150 hover:border-border-strong hover:bg-secondary active:scale-[0.98]"
              >
                View Source
              </a>
            </div>
          </div>

          {/* Right column sits over the page glow. */}
          <div className="relative">
            <div className="glow-strong -top-40 -left-32 h-[600px] w-[145%]" />
            <div className="relative">
              <ChatMock />
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-3 lg:pb-20">
          <h2 className="sr-only">How Cue works</h2>

          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-xl border border-border bg-card/50 p-5 transition-all duration-150 hover:border-border-hover hover:bg-elevated"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 transition-colors duration-150 group-hover:bg-primary/15">
                <Icon aria-hidden="true" className="size-[18px]" />
              </span>

              <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}
