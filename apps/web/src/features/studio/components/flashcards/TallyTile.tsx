import { cn } from "@/shared/utils/cn";
import { useCountUp } from "../../motion/useCountUp";
import type { RatingConfig } from "./ratings";

/** One rating's count on the session-complete screen; counts up when it appears. */
export function TallyTile({
  config,
  value,
  className,
}: {
  config: RatingConfig;
  value: number;
  className?: string;
}) {
  const shown = useCountUp(value, 700);
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl bg-card py-3 shadow-xs ring-1 ring-hairline",
        className
      )}
    >
      <span className={cn("font-display text-xl font-semibold tabular-nums", config.toneText)}>
        {shown}
      </span>
      <span className="font-sans text-xs text-muted-foreground">{config.label}</span>
    </div>
  );
}
