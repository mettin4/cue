import type { TransactionStatus } from "@/lib/cue/types";

/**
 * Status is communicated through text color and weight only. No dots, no pills,
 * no badges anywhere on the site.
 *   waiting  -> muted gray
 *   collected-> mint
 *   called back -> dim
 *   failed   -> destructive
 */
const STATUS: Record<TransactionStatus, { label: string; className: string }> = {
  pending_claim: { label: "Waiting to be collected", className: "text-muted-foreground" },
  claimed: { label: "Collected", className: "text-primary" },
  cancelled: { label: "Called back", className: "text-subtle-foreground" },
  failed: { label: "Failed", className: "text-destructive" },
};

export function statusLabel(status: TransactionStatus): string {
  return STATUS[status].label;
}

export function StatusText({
  status,
  className = "",
}: {
  status: TransactionStatus;
  className?: string;
}) {
  const s = STATUS[status];
  return <span className={`font-medium ${s.className} ${className}`}>{s.label}</span>;
}
