"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { addFundsAction } from "./fund-actions";

export function AddMoneyButton({ amount, unavailable }: { amount: string; unavailable?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the demo pool cannot cover a grant, the action is offered but disabled,
  // with the reason shown, rather than a button that would always fail.
  const blocked = Boolean(unavailable);

  function reset() {
    setBusy(false);
    setDone(false);
    setError(null);
  }

  async function addFunds() {
    if (blocked) return;
    setBusy(true);
    setError(null);
    try {
      const result = await addFundsAction();
      if (!result.ok) {
        setError(result.error ?? "We could not add funds right now. Please try again in a moment.");
        setBusy(false);
        return;
      }
      setDone(true);
      setBusy(false);
      router.refresh();
    } catch {
      setError("We could not reach Cue. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="ring-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-[0_8px_26px_-12px_rgb(56_211_137/0.9)] transition-all duration-150 hover:bg-[#45e096] active:scale-[0.97]"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add Money
        </button>
      </DialogTrigger>

      <DialogContent className="border-border-strong bg-popover sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add test funds</DialogTitle>
          <DialogDescription className="space-y-3 leading-relaxed">
            <span className="block">
              This is a testnet demo. The money is test funds from a shared pool
              and has no real value.
            </span>
            <span className="block">
              On the real network, funding comes through Circle. This is the
              placeholder until then.
            </span>
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm leading-relaxed text-destructive">
            {error}
          </p>
        ) : null}

        {!done && unavailable ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{unavailable}</p>
        ) : null}

        {done ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Added ${amount} to your balance. It updates here in a moment.
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          {done ? (
            <DialogClose asChild>
              <Button className="font-medium">Done</Button>
            </DialogClose>
          ) : (
            <Button className="font-medium" onClick={addFunds} disabled={busy || blocked}>
              {busy ? "Adding…" : `Add $${amount}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
