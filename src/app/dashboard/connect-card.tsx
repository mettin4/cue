"use client";

import { Check, ChevronDown, Copy } from "lucide-react";
import { useState, useTransition } from "react";

import {
  generateConnect,
  regenerateConnect,
  revokeConnect,
} from "./connect-actions";

const STEPS = [
  "Open Claude, then Settings and Connectors.",
  "Choose Add custom connector.",
  "Paste your link below and save.",
];

const GROUPS: { label: string; body: string }[] = [
  { label: "Moving money", body: "Add test funds to your balance, send someone money, ask to be paid, split a bill, or set up a payment that repeats every month." },
  { label: "Asking about money", body: "Your balance, what you sent this month, or a plain summary of where it went." },
  { label: "Remembering people", body: "Save someone once, then just use their name instead of typing an email." },
  { label: "Staying in control", body: "Set a spending limit, call a send back before it is collected, or keep track of who owes what." },
];

const EXAMPLES = [
  "Add test funds so I can try sending",
  "Send Jack 20 dollars, jack@gmail.com",
  "What is my balance?",
  "Split 60 evenly between ana@example.com, bea@example.com and me",
  "Set a daily limit of 50 dollars",
];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      // Selecting by hand still works.
    }
  }
  return { copied, copy };
}

function LinkRow({ url, copy, copied }: { url: string; copy: (t: string, k: string) => void; copied: string | null }) {
  return (
    <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-background-sunken px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground/90">{url}</code>
      <button
        type="button"
        onClick={() => copy(url, "link")}
        className="ring-focus inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-raised hover:text-foreground"
      >
        {copied === "link" ? (
          <>
            <Check aria-hidden="true" className="size-3.5 text-primary" /> Copied
          </>
        ) : (
          <>
            <Copy aria-hidden="true" className="size-3.5" /> Copy
          </>
        )}
      </button>
    </div>
  );
}

/**
 * The connect link is the product: nothing works until Cue is added to Claude.
 * So its prominence follows state. Before the link has ever been used this is the
 * setup step, shown high on the page with instructions and examples. Once Claude
 * has called it, it collapses to a quiet line, since a returning person does not
 * need the walkthrough again.
 */
export function ConnectCard({
  mode,
  initialUrl,
}: {
  mode: "setup" | "quiet";
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, start] = useTransition();
  const { copied, copy } = useCopy();

  function run(action: () => Promise<string | null>) {
    start(async () => setUrl(await action()));
  }

  if (mode === "quiet") {
    return <QuietConnect url={url} pending={pending} run={run} copy={copy} copied={copied} />;
  }

  return (
    <section>
      <h2 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
        Connect to Claude
      </h2>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Cue lives inside Claude. Add it once with your personal link, then just
        talk to Claude in plain language to move and manage money. There is nothing
        to install and no config file to edit.
      </p>

      {url ? (
        <>
          <ol className="mt-5 space-y-2">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm text-muted-foreground">
                <span className="tabular text-subtle-foreground">{index + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <LinkRow url={url} copy={copy} copied={copied} />
          </div>
          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => revokeConnect())}
              className="ring-focus rounded text-[13px] text-muted-foreground transition-colors duration-150 hover:text-destructive disabled:opacity-50"
            >
              Revoke
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => regenerateConnect())}
              className="ring-focus rounded text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
          <p className="mt-3 text-xs text-subtle-foreground">
            Anyone with this link can send from your account. Keep it private, and
            revoke it if it leaks.
          </p>
        </>
      ) : (
        <div className="mt-5">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => generateConnect())}
            className="ring-focus inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-[0_8px_26px_-12px_rgb(56_211_137/0.9)] transition-all duration-150 hover:bg-[#45e096] active:scale-[0.97] disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create your connect link"}
          </button>
        </div>
      )}

      <div className="mt-9">
        <h3 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
          What you can do
        </h3>
        <p className="mt-3 text-sm text-muted-foreground">
          Once connected, ask Claude in your own words. It shows you the details and
          waits for your approval before anything moves.
        </p>
        <dl className="mt-4 space-y-3.5">
          {GROUPS.map((g) => (
            <div key={g.label} className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[9.5rem_1fr]">
              <dt className="text-[13px] font-medium text-foreground">{g.label}</dt>
              <dd className="text-[13px] leading-relaxed text-muted-foreground">{g.body}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-9">
        <h3 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
          Try saying
        </h3>
        <ul className="mt-3 space-y-1.5">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => copy(ex, ex)}
                className="ring-focus group flex w-full items-center gap-2.5 rounded-md py-1 text-left text-sm text-foreground/90 transition-colors duration-150 hover:text-foreground"
              >
                <span className="text-subtle-foreground">&ldquo;</span>
                <span className="min-w-0 flex-1 truncate">{ex}</span>
                {copied === ex ? (
                  <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                ) : (
                  <Copy
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-subtle-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function QuietConnect({
  url,
  pending,
  run,
  copy,
  copied,
}: {
  url: string | null;
  pending: boolean;
  run: (action: () => Promise<string | null>) => void;
  copy: (t: string, k: string) => void;
  copied: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-t border-border/60 pt-8">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
          Connected to Claude
        </p>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="ring-focus inline-flex items-center gap-1 rounded text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          Manage
          <ChevronDown
            aria-hidden="true"
            className={`size-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open ? (
        <div className="mt-4">
          {url ? <LinkRow url={url} copy={copy} copied={copied} /> : null}
          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => revokeConnect())}
              className="ring-focus rounded text-[13px] text-muted-foreground transition-colors duration-150 hover:text-destructive disabled:opacity-50"
            >
              Revoke
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => regenerateConnect())}
              className="ring-focus rounded text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
          <p className="mt-3 text-xs text-subtle-foreground">
            Anyone with this link can send from your account. Keep it private, and
            revoke it if it leaks.
          </p>
        </div>
      ) : null}
    </section>
  );
}
