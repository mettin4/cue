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

/**
 * Four steps connected by one line that fades out after the last node. Aligns
 * to the page grid and turns vertical on mobile.
 */
function FlowStrip() {
  return (
    <section aria-label="How it works" className="grid grid-cols-12 gap-x-6">
      <div className="col-span-12">
        <p className="text-[11px] font-medium tracking-[0.32em] text-muted-foreground uppercase">
          Four steps, one motion
        </p>

        <ol className="relative mt-8 grid grid-cols-1 gap-y-8 sm:grid-cols-4 sm:gap-y-0">
          <span
            aria-hidden="true"
            className="absolute top-4 bottom-8 left-[15px] w-px bg-gradient-to-b from-primary/40 via-border to-transparent sm:top-[15px] sm:right-[12%] sm:bottom-auto sm:left-0 sm:h-px sm:w-[76%] sm:bg-gradient-to-r"
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
      </div>
    </section>
  );
}

/**
 * The recipient's half of the story. Statement in columns 1 to 6, the real
 * email as evidence in columns 7 to 12, the two vertically centred and sized to
 * balance each other.
 */
function RecipientSection() {
  return (
    <section
      aria-label="What the recipient sees"
      className="grid grid-cols-12 items-center gap-x-6 gap-y-10"
    >
      <div className="col-span-12 lg:col-span-6">
        <p className="text-[11px] font-medium tracking-[0.32em] text-muted-foreground uppercase">
          The other side
        </p>
        <h2 className="mt-5 font-display text-[2rem] leading-[1.06] font-semibold tracking-tightest sm:text-[clamp(2.25rem,4vw,3.5rem)]">
          Jack has never opened a crypto app. He does not need to.
        </h2>
        <ul className="mt-8 space-y-2.5">
          <li className="text-sm text-subtle-foreground">No wallet.</li>
          <li className="text-sm text-subtle-foreground">No app to install.</li>
          <li className="text-sm text-subtle-foreground">No seed phrase.</li>
        </ul>
      </div>

      {/* Evidence: the email card, tilted, dimmed and vignetted so it sits into
          the page. Bleeds a little past the container on the right. */}
      <div className="col-span-12 lg:col-span-6">
        <div className="relative mx-auto w-full max-w-[420px] lg:mr-[-6%] lg:ml-auto">
          <div className="glow-soft -inset-10 -z-10" />
          <div className="relative overflow-hidden rounded-xl rotate-[2.5deg] shadow-[0_50px_100px_-40px_rgb(0_0_0/1)] transition-transform duration-300 hover:rotate-0">
            <Image
              src="/screens/email.png"
              alt="The email a recipient receives, showing the amount and a button to collect it"
              width={1320}
              height={1080}
              sizes="(min-width: 1024px) 480px, 420px"
              className="h-auto w-full brightness-[0.92]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-black/10 [background:radial-gradient(ellipse_at_center,transparent_45%,rgb(10_10_11/0.5))]"
            />
          </div>
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
        className="mesh-hero pointer-events-none absolute inset-x-0 top-0 h-[80vh]"
      />
      <div aria-hidden="true" className="grain" />

      {/* One container, one grid. Every section aligns to the same left edge.
          Section rhythm: 96px on mobile, 160px on desktop. */}
      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-6 pt-16 pb-24 md:px-16 md:pt-24 md:pb-40">
        <TypedHero />

        <div className="mt-24 md:mt-40">
          <FlowStrip />
        </div>

        <div className="mt-24 md:mt-40">
          <RecipientSection />
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
