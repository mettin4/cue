"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId } from "react";

/**
 * A deliberate demo affordance, not debug leftovers. Reads "Viewing as: name"
 * with a quiet chevron and sits inside the content near the top. Phase 5
 * replaces it with the signed in user. The native select carries the real
 * values and full emails; the visible label shows only a short handle.
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
  const handle = current ? current.email.split("@")[0] : "demo";

  return (
    <div className="relative inline-flex items-center gap-1.5 rounded-md text-[13px] text-muted-foreground focus-within:ring-2 focus-within:ring-ring/70 focus-within:ring-offset-2 focus-within:ring-offset-background">
      <label htmlFor={selectId} className="sr-only">
        Switch the account being viewed
      </label>
      <span>
        Viewing as{" "}
        <span className="max-w-[140px] truncate align-bottom font-medium text-foreground">
          {handle}
        </span>
      </span>
      <ChevronDown aria-hidden="true" className="size-3.5 text-subtle-foreground" />

      <select
        id={selectId}
        value={currentUserId ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          router.push(
            value ? `/dashboard?user=${encodeURIComponent(value)}` : "/dashboard",
          );
        }}
        className="absolute inset-0 cursor-pointer opacity-0 outline-none"
        aria-label="Switch the account being viewed"
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.email}
          </option>
        ))}
      </select>
    </div>
  );
}
