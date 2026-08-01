import Link from "next/link";

import { CueMark } from "@/components/brand/cue-mark";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 w-full max-w-[1152px] items-center justify-between px-6 md:px-12"
      >
        <Link
          href="/"
          translate="no"
          className="ring-focus font-display flex items-center gap-2.5 rounded-md text-[19px] font-semibold tracking-tight transition-opacity duration-150 hover:opacity-80"
        >
          <CueMark className="h-[30px] w-auto -translate-y-px text-foreground" />
          Cue
        </Link>

        <Link
          href="/dashboard"
          className="ring-focus rounded-md text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          Dashboard
        </Link>
      </nav>
    </header>
  );
}
