import { CueMark } from "@/components/brand/cue-mark";

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-border/50">
      <div className="mx-auto flex w-full max-w-[1280px] items-center gap-2.5 px-6 py-5 md:px-16">
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
        <a
          href="https://github.com/mettin4/cue"
          target="_blank"
          rel="noopener noreferrer"
          className="ring-focus rounded text-[13px] text-subtle-foreground transition-colors duration-150 hover:text-foreground"
        >
          Source
        </a>
      </div>
    </footer>
  );
}
