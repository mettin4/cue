"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function formatRemaining(totalSeconds: number): string {
  if (totalSeconds <= 0) return "a moment";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0
      ? `${hours} hour${hours === 1 ? "" : "s"} ${minutes} min`
      : `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/**
 * Counts down to the unlock moment and reloads the page once it passes, so the
 * server can hand back the collectable view.
 *
 * The first render uses the value the server calculated, which keeps the markup
 * identical across hydration. Ticking only starts after mount.
 */
export function Countdown({ initialSeconds }: { initialSeconds: number }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) {
      router.refresh();
      return;
    }

    const timer = setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          clearInterval(timer);
          router.refresh();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [seconds, router]);

  return (
    <p className="tabular text-sm font-medium text-primary" aria-live="polite">
      Available in {formatRemaining(seconds)}
    </p>
  );
}
