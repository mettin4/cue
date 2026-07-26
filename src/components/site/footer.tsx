export function SiteFooter() {
  return (
    <footer className="border-t border-border/50">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <p
          translate="no"
          className="font-display text-[13px] font-semibold tracking-tight text-foreground/70"
        >
          Cue
        </p>
        <p className="text-[13px] text-subtle-foreground">
          Write to Claude, money moves.
        </p>
      </div>
    </footer>
  );
}
