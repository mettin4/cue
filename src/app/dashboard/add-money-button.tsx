"use client";

import { Plus } from "lucide-react";

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

export function AddMoneyButton() {
  return (
    <Dialog>
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
          <DialogTitle>Adding money is coming soon</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Topping up your own balance lands in a later release. While Cue is in
            testing the team funds accounts for you, so just ask if you need more
            to try things out.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button className="font-medium">Got It</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
