"use client";

import { ArrowRight } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { requestSignIn } from "@/app/auth/actions";

/**
 * Email field that sends a magic link. Used for the signed out state and inline
 * wherever a scoped session hits something it needs a full sign in to do. No
 * password, since recipients already arrive by email.
 */
export function SignInForm({
  label = "Enter your email to sign in or create an account",
  cta = "Continue",
}: {
  label?: string;
  cta?: string;
}) {
  const emailId = useId();
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    start(async () => {
      const result = await requestSignIn(email);
      if (result.ok) setMessage(result.message);
      else setError(result.message);
    });
  }

  if (message) {
    return (
      <p className="rounded-lg border border-primary/25 bg-primary/8 px-4 py-3 text-sm text-foreground">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor={emailId} className="block text-[13px] font-medium text-muted-foreground">
        {label}
      </label>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
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
          className="h-11 flex-1 border-border bg-background/60 transition-colors duration-150 hover:border-border-strong focus-visible:border-primary/50"
        />
        <button
          type="submit"
          disabled={pending}
          className="ring-focus group inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_8px_30px_-10px_rgb(56_211_137/0.7)] transition-all duration-150 hover:bg-[#45e096] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
        >
          {pending ? "Sending…" : cta}
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </button>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
