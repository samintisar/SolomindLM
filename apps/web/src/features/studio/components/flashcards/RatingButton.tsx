import { cva } from "class-variance-authority";
import type React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/utils/cn";
import type { RatingConfig, SrsRating } from "./ratings";

const ratingButtonVariants = cva(
  "flex flex-col items-center gap-0.5 rounded-xl bg-card px-2 py-2.5 font-sans shadow-xs ring-1 ring-hairline outline-hidden transition duration-200 ease-out hover:-translate-y-0.5 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
);

interface RatingButtonProps {
  config: RatingConfig;
  /** Next-review interval, e.g. "in 10 min". */
  subtext: string;
  onRate: (rating: SrsRating) => void;
  disabled?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

/** One of the four spaced-repetition ratings, with its interval and a key hint on hover. */
export function RatingButton({ config, subtext, onRate, disabled, ref }: RatingButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          aria-keyshortcuts={config.key}
          onClick={() => onRate(config.rating)}
          className={cn(ratingButtonVariants(), config.toneHover)}
        >
          <span className={cn("text-sm font-semibold", config.toneText)}>{config.label}</span>{" "}
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{subtext}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Press {config.key}</TooltipContent>
    </Tooltip>
  );
}
