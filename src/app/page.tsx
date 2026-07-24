import Link from "next/link";

const FEATURES = [
  {
    title: "Send by Chatting",
    body: "Tell Claude who to pay and how much. No forms, no account numbers, no app to open.",
  },
  {
    title: "Recipients Need Only an Email",
    body: "They get a link, enter their email and collect. Nothing to install and nothing to set up first.",
  },
  {
    title: "Call It Back Within an Hour",
    body: "Every send holds for an hour before it unlocks. Change your mind and take it back instantly.",
  },
];

function ChatMock() {
  return (
    <div
      aria-label="Example conversation with Claude"
      role="img"
      className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-4 shadow-2xl shadow-black/40 sm:p-5"
    >
      {/* Outgoing message */}
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-[15px] break-words">
          Send Jack 50 dollars, jack@gmail.com
        </p>
      </div>

      {/* Claude reply */}
      <div className="mt-4 flex gap-2.5">
        <span
          aria-hidden="true"
          className="mt-1 size-6 shrink-0 rounded-full border border-border bg-secondary"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-muted-foreground">
            Done. Jack has an hour to wait before it unlocks, so you can still
            call it back.
          </p>

          <div className="mt-3 rounded-xl border border-border bg-background p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs tracking-wide text-muted-foreground uppercase">
                Sent
              </span>
              <span className="tabular text-2xl font-semibold text-primary">
                $50.00
              </span>
            </div>

            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">To</dt>
                <dd className="min-w-0 truncate">jack@gmail.com</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-primary"
                  />
                  Waiting to be collected
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
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
      <section className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Write to Claude, money moves.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:mt-5 sm:text-lg">
          Cue turns a sentence into a payment. Ask Claude to send money to an
          email address and the person on the other end collects it in a couple
          of taps.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            Open Dashboard
          </Link>
          <a
            href="https://github.com/mettin4/cue"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-6 text-sm font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            View Source
          </a>
        </div>
      </section>

      <section className="mt-12 sm:mt-16">
        <ChatMock />
      </section>

      <section className="mt-14 grid gap-8 sm:mt-20 sm:grid-cols-3 sm:gap-6">
        <h2 className="sr-only">How Cue works</h2>
        {FEATURES.map((feature) => (
          <div key={feature.title}>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-primary"
              />
              {feature.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {feature.body}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
