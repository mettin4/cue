"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";

/**
 * Keeps server wording out of the interface. Anything that leaks internals gets
 * replaced with a plain sentence a person can act on.
 */
function readableError(message: string): string {
  const technical = /circle|supabase|postgres|http\s?\d|undefined|token/i;

  if (/already been paid/i.test(message)) {
    return "This request has already been paid.";
  }
  if (/was cancelled/i.test(message)) {
    return "This request was cancelled, so there is nothing to pay.";
  }
  if (/same address|created by this account/i.test(message)) {
    return "This request came from this email, so it cannot be paid from the same address. Use a different one.";
  }
  if (/not enough available/i.test(message)) {
    return "There is not enough available to pay this right now. Try again shortly.";
  }
  if (/not valid/i.test(message)) {
    return "This payment link is not valid.";
  }
  if (technical.test(message)) {
    return "Something went wrong on our side. Please try again in a moment.";
  }
  return message;
}

export function PayForm({
  payToken,
  amount,
  requesterLabel,
}: {
  payToken: string;
  amount: string;
  requesterLabel: string;
}) {
  const emailId = useId();
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("sending");

    try {
      const response = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payToken, payerEmail: email }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(readableError(payload.error ?? "Something went wrong."));
        setStatus("idle");
        return;
      }

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
          On its way to {requesterLabel}. They will collect it shortly.
        </p>

        <Link
          href="/dashboard"
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
        Enter your email to pay
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

      <p className="mt-2 text-xs text-subtle-foreground">
        New to Cue? An account is created for you automatically when you pay.
      </p>

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
        {status === "sending" ? "Paying…" : `Pay $${amount}`}
      </button>
    </form>
  );
}
