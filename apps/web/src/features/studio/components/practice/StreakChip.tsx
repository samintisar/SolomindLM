import { Flame } from "lucide-react";

/** "3 in a row", shown once the learner has two in a row. */
export function StreakChip({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1 whitespace-nowrap normal-case tracking-normal text-primary animate-in fade-in slide-in-from-bottom-1 duration-300"
    >
      <Flame aria-hidden className="size-3.5" />
      {streak} in a row
    </span>
  );
}
