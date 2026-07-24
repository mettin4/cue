import Link from "next/link";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-5 sm:px-8"
      >
        <Link
          href="/"
          translate="no"
          className="flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full bg-primary shadow-[0_0_12px_rgb(56_211_137/0.8)]"
          />
          Cue
        </Link>

        <Link
          href="/dashboard"
          className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          Dashboard
        </Link>
      </nav>
    </header>
  );
}
