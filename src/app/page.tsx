import Link from "next/link";
import { ArrowRight, MailCheck, MessagesSquare, Undo2 } from "lucide-react";

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

function ClaudeAvatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[13px] font-semibold text-primary ring-1 ring-primary/25"
    >
      C
    </span>
  );
}

function ChatMock() {
  return (
    <div
      aria-label="Example conversation with Claude"
      role="img"
      className="relative mx-auto w-full max-w-lg"
    >
      {/* Single glow source for this page, sitting behind the mock. */}
      <div className="glow -top-28 left-1/2 h-[460px] w-[135%] -translate-x-1/2" />

      <div className="relative rounded-2xl border border-border-strong/70 bg-card/90 p-4 shadow-[0_24px_70px_-20px_rgb(0_0_0/0.9)] backdrop-blur-sm sm:p-5">
        {/* Outgoing message */}
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-[15px] break-words">
            Send Jack 50 dollars, jack@gmail.com
          </p>
        </div>

        {/* Claude reply */}
        <div className="mt-5 flex gap-3">
          <ClaudeAvatar />

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
                    <span className="text-foreground">
                      Waiting to be collected
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative">
      {/* Texture, faded out toward the bottom so it never competes with content. */}
      <div
        aria-hidden="true"
        className="bg-dots bg-dots-fade pointer-events-none absolute inset-x-0 top-0 h-[560px]"
      />

      <div className="relative mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <section className="text-center">
          <h1 className="tracking-tightest text-[2.6rem] leading-[1.05] font-semibold sm:text-6xl lg:text-[4.25rem]">
            Write to Claude,
            <br />
            <span className="text-gradient-mint">money moves.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-lg">
            Cue turns a sentence into a payment. Ask Claude to send money to an
            email address and the person on the other end collects it in a
            couple of taps.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
        </section>

        <section className="mt-16 sm:mt-20">
          <ChatMock />
        </section>

        <section className="mt-16 grid gap-4 sm:mt-24 sm:grid-cols-3">
          <h2 className="sr-only">How Cue works</h2>

          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-xl border border-border bg-card/50 p-5 transition-all duration-150 hover:border-border-strong hover:bg-card"
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
    </div>
  );
}
