import Link from "next/link";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/75 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <Link
          href="/"
          translate="no"
          className="ring-focus font-display flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight transition-opacity duration-150 hover:opacity-80"
        >
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full bg-primary shadow-[0_0_12px_rgb(56_211_137/0.8)]"
          />
          Cue
        </Link>

        <Link
          href="/dashboard"
          className="ring-focus rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          Dashboard
        </Link>
      </nav>
    </header>
  );
}
