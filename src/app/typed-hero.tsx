"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { LiveDot } from "@/components/ui/status-chip";

const SENTENCE = "Send Jack 50 dollars, jack@gmail.com";
const SPEED_MS = 45;

export function TypedHero() {
  // Start fully shown so server render, no-JS, and reduced-motion all get the
  // finished line. Animation only kicks in on mount when motion is allowed.
  const [count, setCount] = useState(SENTENCE.length);
  const [done, setDone] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    setCount(0);
    setDone(false);

    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= SENTENCE.length) {
        clearInterval(id);
        setDone(true);
      }
    }, SPEED_MS);

    return () => clearInterval(id);
  }, []);

  const shown = SENTENCE.slice(0, count);

  return (
    <section className="relative">
      {/* Caption: the tagline demoted to a quiet label above the sentence. */}
      <p className="text-[11px] font-medium tracking-[0.32em] text-muted-foreground uppercase">
        Write to Claude, money moves.
      </p>

      {/* The product's own sentence, typing itself out. This is the hero. */}
      <h1 className="mt-5 max-w-[15ch] font-display text-[2.6rem] leading-[1.02] font-semibold tracking-tightest sm:max-w-none sm:text-[clamp(3rem,8vw,7rem)]">
        <span className="sr-only">{SENTENCE}</span>
        <span aria-hidden="true">
          {shown}
          <span
            className={`ml-1 inline-block w-[0.06em] bg-primary ${done ? "caret-blink" : ""}`}
            style={{ height: "0.92em", transform: "translateY(0.12em)" }}
          />
        </span>
      </h1>

      <div className="mt-9">
        <Link
          href="/dashboard"
          className="ring-focus group inline-flex h-12 items-center justify-center gap-1.5 rounded-lg bg-primary px-7 text-[15px] font-medium text-primary-foreground shadow-[0_10px_36px_-12px_rgb(56_211_137/0.8)] transition-all duration-150 hover:bg-[#45e096] active:scale-[0.98]"
        >
          Open Dashboard
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </Link>
      </div>

      {/* Confirmation card: fades in once the sentence finishes. Deliberately
          offset to the right and allowed to bleed past the container edge. */}
      <div
        className={`mt-14 flex justify-end transition-all duration-700 ease-out sm:-mr-6 lg:-mr-16 ${
          done ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <div className="surface-gradient w-full max-w-sm overflow-hidden rounded-2xl border border-primary/25 bg-elevated p-5 shadow-[0_0_0_1px_rgb(56_211_137/0.06),0_28px_60px_-30px_rgb(56_211_137/0.5)]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-medium tracking-[0.14em] text-subtle-foreground uppercase">
              Sent
            </span>
            <span className="tabular text-3xl font-semibold tracking-tightest text-primary">
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
    </section>
  );
}
