"use client";

import { Check, Copy } from "lucide-react";
import { useState, useTransition } from "react";

import {
  generateConnect,
  regenerateConnect,
  revokeConnect,
} from "./connect-actions";

const STEPS = [
  "Open Claude, then Settings and Connectors.",
  "Choose Add custom connector.",
  "Paste your connect link and save.",
];

/**
 * Shows the account's personal connect link for Claude Desktop, or a button to
 * create one. A leaked link can move money, so revoke and regenerate are here
 * too. No config file to edit, the link is the whole setup.
 */
export function ConnectCard({
  userId,
  initialUrl,
}: {
  userId: string;
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Selecting by hand still works.
    }
  }

  function run(action: () => Promise<string | null>) {
    start(async () => {
      setUrl(await action());
    });
  }

  return (
    <section className="border-t border-border/60 pt-8">
      <h2 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
        Connect to Claude
      </h2>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Add Cue to Claude with your personal link, then ask in plain language.
        Eighteen things Claude can do: send money, call a send back, request
        money, split a bill, schedule a monthly payment, manage those schedules,
        save and list contacts, summarise your spending, set a spending limit,
        track and settle debts and send a reminder, check your balance and
        history, see if something was collected, and resend a collection link. It
        shows you the details and waits for your approval before anything moves.
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

          <div className="mt-4 flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-background-sunken px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground/90">
              {url}
            </code>
            <button
              type="button"
              onClick={copy}
              className="ring-focus inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-raised hover:text-foreground"
            >
              {copied ? (
                <>
                  <Check aria-hidden="true" className="size-3.5 text-primary" />
                  Copied
                </>
              ) : (
                <>
                  <Copy aria-hidden="true" className="size-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => revokeConnect(userId))}
              className="ring-focus rounded text-[13px] text-muted-foreground transition-colors duration-150 hover:text-destructive disabled:opacity-50"
            >
              Revoke
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => regenerateConnect(userId))}
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
            onClick={() => run(() => generateConnect(userId))}
            className="ring-focus inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-[0_8px_26px_-12px_rgb(56_211_137/0.9)] transition-all duration-150 hover:bg-[#45e096] active:scale-[0.97] disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create connect link"}
          </button>
        </div>
      )}
    </section>
  );
}
