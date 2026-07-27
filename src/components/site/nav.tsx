import Link from "next/link";

import { CueMark } from "@/components/brand/cue-mark";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <Link
          href="/"
          translate="no"
          className="ring-focus font-display flex items-center gap-2.5 rounded-md text-[19px] font-semibold tracking-tight transition-opacity duration-150 hover:opacity-80"
        >
          <CueMark className="h-[30px] w-auto -translate-y-px text-foreground" />
          Cue
        </Link>

        <div className="flex items-center gap-5">
          <a
            href="https://github.com/mettin4/cue"
            target="_blank"
            rel="noopener noreferrer"
            className="ring-focus rounded-md text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            View Source
          </a>
          <Link
            href="/dashboard"
            className="ring-focus rounded-md text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Dashboard
          </Link>
        </div>
      </nav>
    </header>
  );
}
