import { CheckCircle2, MailOpen, PenLine, Wallet } from "lucide-react";

import { SiteFooter } from "@/components/site/footer";

import { TypedHero } from "./typed-hero";

const STEPS = [
  { icon: PenLine, label: "Type" },
  { icon: CheckCircle2, label: "Approve" },
  { icon: MailOpen, label: "Email lands" },
  { icon: Wallet, label: "Collect" },
];

/**
 * A single continuous object: one line runs through four points. On mobile the
 * line turns vertical. No card borders, so it reads as drawn rather than built.
 */
function FlowStrip() {
  return (
    <section aria-label="How it works" className="relative">
      <p className="text-[11px] font-medium tracking-[0.32em] text-muted-foreground uppercase">
        Four steps, one motion
      </p>

      <ol className="relative mt-8 grid grid-cols-1 gap-y-8 sm:grid-cols-4 sm:gap-y-0">
        {/* The connecting line. Horizontal on desktop, vertical on mobile. */}
        <span
          aria-hidden="true"
          className="absolute left-[15px] top-4 bottom-4 w-px bg-gradient-to-b from-primary/50 via-border to-primary/50 sm:top-[15px] sm:right-0 sm:bottom-auto sm:left-0 sm:h-px sm:w-full sm:bg-gradient-to-r"
        />

        {STEPS.map(({ icon: Icon, label }, index) => (
          <li key={label} className="relative flex items-center gap-4 sm:flex-col sm:items-start sm:gap-0">
            <span className="relative z-10 flex size-8 items-center justify-center rounded-full bg-background text-primary ring-1 ring-primary/30">
              <Icon aria-hidden="true" className="size-[15px]" />
            </span>
            <div className="sm:mt-4">
              <span className="tabular text-[11px] font-medium text-subtle-foreground">
                0{index + 1}
              </span>
              <p className="font-display text-[15px] font-semibold sm:mt-0.5">
                {label}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Organic mesh behind the hero, plus page-wide grain. */}
      <div
        aria-hidden="true"
        className="mesh-hero pointer-events-none absolute inset-x-0 top-0 h-[80vh]"
      />
      <div aria-hidden="true" className="grain" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Hero runs wide from the left margin. */}
        <div className="pt-16 pb-20 sm:pt-24 lg:pt-28">
          <TypedHero />
        </div>

        {/* Flow strip, offset further right than the hero for editorial rhythm. */}
        <div className="pb-24 sm:pl-[8%] lg:pl-[16%]">
          <FlowStrip />
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
