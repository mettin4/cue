import { CueMark } from "@/components/brand/cue-mark";

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-border/50">
      <div className="mx-auto flex w-full max-w-[1152px] items-center gap-2.5 px-6 py-5 md:px-12">
        <CueMark className="h-4 w-auto text-foreground/70" />
        <span
          translate="no"
          className="font-display text-[13px] font-semibold tracking-tight text-foreground/70"
        >
          Cue
        </span>
        <span aria-hidden="true" className="text-subtle-foreground">
          ·
        </span>
        <span className="text-[13px] text-subtle-foreground">Write to Claude, money moves.</span>
      </div>
    </footer>
  );
}
