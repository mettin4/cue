"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
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
      setError(
        "We could not reach Cue. Check your connection and try again.",
      );
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="text-center">
        <div
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/15"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="#38D389"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        <p className="tabular mt-5 text-4xl font-semibold">${amount}</p>
        <p className="mt-2 text-muted-foreground">
          The money is in your Cue account.
        </p>

        <Link
          href={`/dashboard?user=${encodeURIComponent(collectedEmail)}`}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 text-left">
      <label htmlFor={emailId} className="block text-sm font-medium">
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
        className="mt-2 h-11"
      />

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={status === "sending"}
        className="mt-4 h-11 w-full text-sm font-medium"
      >
        {status === "sending" ? "Collecting…" : `Collect $${amount}`}
      </Button>
    </form>
  );
}
