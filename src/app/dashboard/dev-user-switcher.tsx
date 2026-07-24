"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";

/**
 * Temporary stand in for sign in. Floated out of the page flow and marked so it
 * never reads as product surface. Phase 5 removes this entirely.
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

  return (
    <div className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full border border-dashed border-border-strong bg-popover/95 py-1.5 pr-2 pl-2.5 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.9)] backdrop-blur-md">
      <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-subtle-foreground">
        DEV
      </span>

      <label htmlFor={selectId} className="sr-only">
        Switch the account being viewed
      </label>

      <select
        id={selectId}
        value={currentUserId ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          router.push(
            value ? `/dashboard?user=${encodeURIComponent(value)}` : "/dashboard",
          );
        }}
        className="ring-focus max-w-[170px] truncate rounded-full bg-transparent py-0.5 pr-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <option value="">Pick an account…</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.email}
          </option>
        ))}
      </select>
    </div>
  );
}
