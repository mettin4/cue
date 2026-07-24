"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CancelButton({
  transactionId,
  senderUserId,
  amount,
  counterparty,
}: {
  transactionId: string;
  senderUserId: string;
  amount: string;
  counterparty: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmCancel() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, senderUserId }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(
          /already collected/i.test(payload.error ?? "")
            ? "This was collected a moment ago, so it can no longer be called back."
            : "We could not call this back. Please try again.",
        );
        setBusy(false);
        return;
      }

      setOpen(false);
      setBusy(false);
      router.refresh();
    } catch {
      setError("We could not reach Cue. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="ring-focus mt-0.5 inline-flex h-8 shrink-0 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-all duration-150 hover:border-border-strong hover:bg-secondary hover:text-foreground active:scale-[0.97]"
        >
          Call Back
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Call back ${amount}?</DialogTitle>
          <DialogDescription>
            {counterparty} will no longer be able to collect this. The money
            stays in your account.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              Keep It
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirmCancel} disabled={busy}>
            {busy ? "Calling back…" : "Call It Back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
