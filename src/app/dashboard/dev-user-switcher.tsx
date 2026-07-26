"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId } from "react";

/**
 * Temporary stand in for sign in. Floated out of the page flow and marked so it
 * never reads as product surface. Phase 5 removes this entirely.
 *
 * The closed pill shows only a short handle, never the full address. The native
 * select still lists complete emails once opened, which keeps it accessible.
 */
export function DevUserSwitcher({
  users,
  currentUserId,
}: {
  users: { id: string; email: string }[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const selectId = useId();

  const current = users.find((user) => user.id === currentUserId);
  const handle = current
    ? current.email.split("@")[0].slice(0, 10)
    : "none";

  return (
    <div className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full border border-dashed border-border-strong bg-popover/95 py-1.5 pr-2 pl-2.5 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.9)] backdrop-blur-md">
      <span className="rounded-full bg-raised px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-subtle-foreground">
        DEV
      </span>

      <label htmlFor={selectId} className="sr-only">
        Switch the account being viewed
      </label>

      {/* The select carries the real values and is transparent, while the label
          on top shows only the short handle. */}
      <div className="relative flex items-center gap-1 rounded-full focus-within:ring-2 focus-within:ring-ring/70 focus-within:ring-offset-2 focus-within:ring-offset-popover">
        <span className="max-w-[120px] truncate text-xs text-muted-foreground">
          user: {handle}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 text-subtle-foreground"
        />

        <select
          id={selectId}
          value={currentUserId ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            router.push(
              value ? `/dashboard?user=${encodeURIComponent(value)}` : "/dashboard",
            );
          }}
          className="absolute inset-0 cursor-pointer rounded-full opacity-0 outline-none"
          aria-label="Switch the account being viewed"
        >
          <option value="">Pick an account…</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.email}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
