"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Item = { id: string; label: string; masked: string };

/**
 * A deliberate demo affordance, not debug leftovers, and a custom listbox so it
 * stays on the dark theme (a native select renders OS chrome we cannot style).
 * Keyboard accessible: arrows move, Enter selects, Escape closes, click outside
 * closes. Addresses are shown masked; the primary label is a short handle.
 * Phase 5 replaces this with the signed in user.
 */
export function DevUserSwitcher({
  users,
  currentUserId,
}: {
  users: Item[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const currentIndex = Math.max(
    0,
    users.findIndex((u) => u.id === currentUserId),
  );
  const [active, setActive] = useState(currentIndex);

  const current = users.find((u) => u.id === currentUserId);

  useEffect(() => {
    if (open) {
      setActive(currentIndex);
      listRef.current?.focus();
    }
  }, [open, currentIndex]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(id: string) {
    setOpen(false);
    router.push(`/dashboard?user=${encodeURIComponent(id)}`);
  }

  function onTriggerKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, users.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (users[active]) choose(users[active].id);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="ring-focus inline-flex items-center gap-1.5 rounded-md text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        Viewing as{" "}
        <span className="max-w-[120px] truncate font-medium text-foreground">
          {current?.label ?? "demo"}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 text-subtle-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${baseId}-${active}`}
          onKeyDown={onListKey}
          className="absolute right-0 z-50 mt-2 min-w-[210px] overflow-hidden rounded-lg border border-border-strong bg-popover p-1 shadow-[0_16px_40px_-16px_rgb(0_0_0/0.9)] outline-none"
        >
          {users.map((user, index) => (
            <li
              key={user.id}
              id={`${baseId}-${index}`}
              role="option"
              aria-selected={user.id === currentUserId}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(user.id)}
              className={`cursor-pointer rounded-md px-2.5 py-1.5 ${
                index === active ? "bg-primary/15" : ""
              }`}
            >
              <div
                className={`text-[13px] font-medium ${
                  user.id === currentUserId ? "text-primary" : "text-foreground"
                }`}
              >
                {user.label}
              </div>
              <div className="text-[11px] text-subtle-foreground">{user.masked}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
