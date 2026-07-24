"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";

/**
 * Keeps server wording out of the interface. The API already writes for people,
 * but anything that leaks internals gets replaced with a plain sentence.
 */
function readableError(message: string): string {
  const technical = /circle|supabase|postgres|http\s?\d|undefined|token/i;

  if (/different email address/i.test(message)) {
    return "That email does not match the one this was sent to. Check the address and try again.";
  }
  if (/already been collected/i.test(message)) {
    return "This money has already been collected.";
  }
  if (/called this money back|called back/i.test(message)) {
    return "The sender called this money back, so there is nothing to collect.";
  }
  if (/not available yet|unlocks in/i.test(message)) {
    return "This is not unlocked yet. Wait a moment and refresh the page.";
  }
  if (/not valid/i.test(message)) {
    return "This link is not valid.";
  }
  if (/still settling|taking longer/i.test(message)) {
    return "This is taking longer than usual and is still going through. Check your dashboard shortly rather than trying again.";
  }
  if (technical.test(message)) {
    return "Something went wrong on our side. Please try again in a moment.";
  }
  return message;
}

export function CollectForm({
  claimToken,
  amount,
}: {
  claimToken: string;
  amount: string;
}) {
  const emailId = useId();
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [collectedEmail, setCollectedEmail] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("sending");

    try {
      const response = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimToken, recipientEmail: email }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(readableError(payload.error ?? "Something went wrong."));
        setStatus("idle");
        return;
      }

      setCollectedEmail(email);
      setStatus("done");
    } catch {
      setError("We could not reach Cue. Check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="text-center">
        <div
          aria-hidden="true"
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/25"
        >
          <Check className="size-6" strokeWidth={2.5} />
        </div>

        <p className="tabular tracking-tightest mt-6 text-5xl font-semibold text-primary">
          ${amount}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          The money is in your Cue account.
        </p>

        <Link
          href={`/dashboard?user=${encodeURIComponent(collectedEmail)}`}
          className="ring-focus group mt-7 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[0_8px_30px_-10px_rgb(56_211_137/0.7)] transition-all duration-150 hover:bg-[#45e096] active:scale-[0.98]"
        >
          Go to Dashboard
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-7 text-left">
      <label
        htmlFor={emailId}
        className="block text-[13px] font-medium text-muted-foreground"
      >
        Enter the email address this was sent to
      </label>

      <Input
        id={emailId}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        required
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="mt-2 h-11 border-border bg-background/60 transition-colors duration-150 hover:border-border-strong focus-visible:border-primary/50"
      />

      {error ? (
        <p id={errorId} role="alert" className="mt-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "sending"}
        className="ring-focus mt-4 inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground shadow-[0_10px_36px_-12px_rgb(56_211_137/0.9)] transition-all duration-150 hover:bg-[#45e096] hover:shadow-[0_12px_44px_-12px_rgb(56_211_137/1)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
      >
        {status === "sending" ? "Collecting…" : `Collect $${amount}`}
      </button>
    </form>
  );
}
