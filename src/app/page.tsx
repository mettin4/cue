import Image from "next/image";
import { CheckCircle2, MailOpen, PenLine, Wallet } from "lucide-react";

import { SiteFooter } from "@/components/site/footer";

import { TypedHero } from "./typed-hero";

const STEPS = [
  { icon: PenLine, label: "Type" },
  { icon: CheckCircle2, label: "Approve" },
  { icon: MailOpen, label: "Email lands" },
  { icon: Wallet, label: "Collect" },
];

const RECIPIENT_NOTES = [
  "No wallet.",
  "No app to install.",
  "No seed phrase.",
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
          className="absolute top-4 bottom-4 left-[15px] w-px bg-gradient-to-b from-primary/50 via-border to-primary/50 sm:top-[15px] sm:right-0 sm:bottom-auto sm:left-0 sm:h-px sm:w-full sm:bg-gradient-to-r"
        />

        {STEPS.map(({ icon: Icon, label }, index) => (
          <li
            key={label}
            className="relative flex items-center gap-4 sm:flex-col sm:items-start sm:gap-0"
          >
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

/**
 * The recipient's half of the story: the person receiving money needs to know
 * nothing about crypto. The real email they get is shown as evidence, framed
 * like a phone and tilted so it breaks the grid.
 */
function RecipientSection() {
  return (
    <section
      aria-label="What the recipient sees"
      className="relative border-t border-border/50 bg-background-sunken"
    >
      <div className="mx-auto grid w-full max-w-6xl items-start gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_240px] lg:gap-20 lg:py-28">
        <div>
          <p className="text-[11px] font-medium tracking-[0.32em] text-muted-foreground uppercase">
            The other side
          </p>

          <h2 className="mt-5 max-w-[16ch] font-display text-[2rem] leading-[1.06] font-semibold tracking-tightest sm:text-[clamp(2.25rem,4vw,3.5rem)]">
            Jack has never opened a crypto app. He does not need to.
          </h2>

          <ul className="mt-8 space-y-2.5">
            {RECIPIENT_NOTES.map((note) => (
              <li key={note} className="text-sm text-subtle-foreground">
                {note}
              </li>
            ))}
          </ul>
        </div>

        {/* Evidence: the email card itself, no window chrome, tilted and
            floating, allowed to bleed past the container on the right. Raised to
            sit level with the statement rather than below it. */}
        <div className="relative mx-auto mt-1 w-full max-w-[240px] lg:mx-0 lg:mr-[-8%] lg:w-[240px]">
          <div className="glow-soft -inset-8 -z-10" />
          <Image
            src="/screens/email.png"
            alt="The email a recipient receives, showing the amount and a button to collect it"
            width={470}
            height={450}
            sizes="240px"
            className="h-auto w-full rotate-[3deg] rounded-xl shadow-[0_40px_90px_-35px_rgb(0_0_0/1)] ring-1 ring-black/5 transition-transform duration-300 hover:rotate-0"
          />
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Organic mesh behind the hero, plus page-wide grain. */}
      <div
        aria-hidden="true"
        className="mesh-hero pointer-events-none absolute inset-x-0 top-0 h-[85vh]"
      />
      <div aria-hidden="true" className="grain" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Hero conversation runs wide from the left margin. */}
        <div className="pt-14 pb-16 sm:pt-20">
          <TypedHero />
        </div>

        {/* Flow strip, offset further right than the hero for editorial rhythm. */}
        <div className="pb-24 sm:pl-[8%] lg:pl-[16%]">
          <FlowStrip />
        </div>
      </div>

      {/* Recipient section is its own full-bleed band, visually distinct. */}
      <div className="relative z-10">
        <RecipientSection />
      </div>

      <SiteFooter />
    </div>
  );
}
