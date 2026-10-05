import { Flame } from "lucide-react";

/**
 * "3 in a row", shown once the learner has two in a row. The status wrapper is always mounted
 * (and has no box of its own), so a screen reader announces the chip when it first appears.
 */
export function StreakChip({ streak }: { streak: number }) {
  return (
    <span role="status" className="contents">
      {streak >= 2 ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap normal-case tracking-normal text-primary animate-in fade-in slide-in-from-bottom-1 duration-300">
          <Flame aria-hidden className="size-3.5" />
          {streak} in a row
        </span>
      ) : null}
    </span>
  );
}
