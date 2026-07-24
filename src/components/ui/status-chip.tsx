import type { TransactionStatus } from "@/lib/cue/types";

/**
 * Live dot. The core stays solid while a ring breathes out of it, so a waiting
 * transfer reads as active rather than static.
 */
export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span className={`relative flex size-1.5 shrink-0 ${className}`}>
      <span className="pulse-ring absolute inset-0 rounded-full" />
      <span className="relative size-1.5 rounded-full bg-current" />
    </span>
  );
}

const CHIP: Record<
  TransactionStatus,
  { label: string; className: string; live?: boolean }
> = {
  pending_claim: {
    label: "Waiting to be collected",
    className: "bg-warning/10 text-warning ring-warning/20",
    live: true,
  },
  claimed: {
    label: "Collected",
    className: "bg-primary/10 text-primary ring-primary/20",
  },
  cancelled: {
    label: "Called back",
    className: "bg-secondary text-muted-foreground ring-border-strong/60",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive ring-destructive/25",
  },
};

export function StatusChip({ status }: { status: TransactionStatus }) {
  const chip = CHIP[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium ring-1 ring-inset ${chip.className}`}
    >
      {chip.live ? <LiveDot /> : null}
      {chip.label}
    </span>
  );
}
