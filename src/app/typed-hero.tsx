"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { CueMark } from "@/components/brand/cue-mark";

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

      {/* The user's sentence, typing itself out. This is the hero. */}
      <h1 className="mt-5 max-w-[15ch] font-display text-[2.6rem] leading-[1.02] font-semibold tracking-tightest sm:max-w-none sm:text-[clamp(3rem,7.5vw,6.5rem)]">
        <span className="sr-only">{SENTENCE}</span>
        <span aria-hidden="true">
          {shown}
          {/* Caret blinks permanently. It is the brand motif the logo mirrors. */}
          <span
            className="caret-blink ml-1 inline-block w-[0.06em] bg-primary"
            style={{ height: "0.92em", transform: "translateY(0.12em)" }}
          />
        </span>
      </h1>

      {/* Reply, then a balanced band: the amount as pure type on the left, the
          single action on the right, so both halves of the lower hero carry
          weight. All of it appears once the sentence finishes typing. */}
      {/* Two halves under the sentence so the lower hero carries weight across
          the full width: Claude's reply on the left, the resulting confirmation
          and the single action on the right. One conversation, left to right. */}
      <div
        className={`mt-10 grid gap-y-8 transition-all duration-700 ease-out lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-x-14 ${
          done ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <div className="flex gap-3.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 ring-1 ring-primary/25"
          >
            <CueMark className="h-4 w-auto text-primary" />
          </span>
          <p className="max-w-md text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Done. Jack has an hour to collect it. You can call it back until
            then.
          </p>
        </div>

        {/* The confirmation, expressed typographically, no box, no dots. */}
        <div>
          <p className="tabular font-display text-[2.75rem] leading-none font-semibold tracking-tightest text-primary">
            $50.00
          </p>
          <p className="mt-4 text-[15px] text-muted-foreground">
            to jack@gmail.com
            <span aria-hidden="true" className="mx-2 text-subtle-foreground">
              ·
            </span>
            waiting to be collected
          </p>

          <Link
            href="/dashboard"
            className="ring-focus group mt-7 inline-flex h-12 items-center justify-center gap-1.5 rounded-lg bg-primary px-7 text-[15px] font-medium text-primary-foreground shadow-[0_10px_36px_-12px_rgb(56_211_137/0.8)] transition-all duration-150 hover:bg-[#45e096] active:scale-[0.98]"
          >
            Open Dashboard
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
