"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";

/**
 * Temporary stand in for sign in. Phase 5 removes this entirely.
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
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-card/60 px-2.5 py-1.5">
      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground">
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
          router.push(value ? `/dashboard?user=${encodeURIComponent(value)}` : "/dashboard");
        }}
        className="max-w-[190px] truncate rounded bg-background px-1.5 py-1 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
