"use client";

import { Check, ChevronDown, Copy } from "lucide-react";
import { useState, useTransition } from "react";

import { generateConnect, regenerateConnect, revokeConnect } from "./connect-actions";

const STEPS = [
  "Open Claude, then Settings and Connectors.",
  "Choose Add custom connector.",
  "Paste your link and save.",
];

const EXAMPLES = [
  "Send Jack 20 dollars, jack@gmail.com",
  "What is my balance?",
  "Split 60 between ana@ and bea@ and me",
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

function TrySaying({ copy, copied }: { copy: (t: string, k: string) => void; copied: string | null }) {
  return (
    <div className="mt-6 border-t border-border/60 pt-5">
      <p className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">Try saying</p>
      <ul className="mt-3 space-y-1">
        {EXAMPLES.map((ex) => (
          <li key={ex}>
            <button
              type="button"
              onClick={() => copy(ex, ex)}
              className="ring-focus group flex w-full items-center gap-2 rounded-md py-1 text-left text-[13px] text-foreground/85 transition-colors duration-150 hover:text-foreground"
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
  );
}

/**
 * The connection is how the product is used at all, so it sits at the top beside
 * the balance and stays a confident panel in every state, never a whisper. When
 * connected it shows a live status, the link and example prompts; when not, it
 * leads with the single action that turns the product on.
 */
export function ConnectPanel({ connected, initialUrl, className }: { connected: boolean; initialUrl: string | null; className?: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, start] = useTransition();
  const [manageOpen, setManageOpen] = useState(false);
  const { copied, copy } = useCopy();

  function run(action: () => Promise<string | null>) {
    start(async () => setUrl(await action()));
  }

  const manage = (
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
  );

  return (
    <section className={`surface-gradient h-full rounded-2xl border border-border bg-card p-6 sm:p-7 ${className ?? ""}`}>
      <div className="flex items-center gap-2.5">
        {connected ? (
          <span aria-hidden="true" className="relative flex size-2 text-primary">
            <span className="pulse-ring absolute inset-0 rounded-full" />
            <span className="relative size-2 rounded-full bg-primary" />
          </span>
        ) : (
          <span aria-hidden="true" className="size-2 rounded-full ring-1 ring-inset ring-border-strong" />
        )}
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          {connected ? "Connected to Claude" : "Connect to Claude"}
        </h2>
      </div>

      {connected ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            You are set. Ask Claude in your own words and it confirms every detail before anything moves.
          </p>
          {url ? (
            <div className="mt-4">
              <LinkRow url={url} copy={copy} copied={copied} />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setManageOpen((o) => !o)}
            aria-expanded={manageOpen}
            className="ring-focus mt-3 inline-flex items-center gap-1 rounded text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Manage link
            <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform duration-150 ${manageOpen ? "rotate-180" : ""}`} />
          </button>
          {manageOpen ? (
            <>
              {manage}
              <p className="mt-3 text-xs leading-relaxed text-subtle-foreground">
                Anyone with this link can send from your account. Keep it private, and revoke it if it leaks.
              </p>
            </>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Cue lives inside Claude. Add it once with your personal link, then move money, ask about it,
            remember people and stay in control, all in plain language.
          </p>
          {url ? (
            <>
              <ol className="mt-5 space-y-2">
                {STEPS.map((step, index) => (
                  <li key={step} className="flex gap-2.5 text-[13px] text-muted-foreground">
                    <span className="tabular text-subtle-foreground">{index + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
              <div className="mt-4">
                <LinkRow url={url} copy={copy} copied={copied} />
              </div>
              {manage}
            </>
          ) : (
            <div className="mt-5">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => generateConnect())}
                className="ring-focus inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_8px_26px_-12px_rgb(56_211_137/0.9)] transition-all duration-150 hover:bg-[#45e096] active:scale-[0.97] disabled:opacity-60"
              >
                {pending ? "Creating…" : "Create your connect link"}
              </button>
            </div>
          )}
        </>
      )}

      <TrySaying copy={copy} copied={copied} />
    </section>
  );
}
