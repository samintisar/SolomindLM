import type React from "react";
import { cn } from "@/shared/utils/cn";
import type { QuestionState } from "./types";

const SEGMENT: Record<QuestionState, string> = {
  correct: "bg-success",
  partial: "bg-warning",
  incorrect: "bg-destructive",
  answered: "bg-primary/60",
};

interface QuestionProgressProps {
  currentIndex: number;
  /** One entry per question; undefined means not answered yet. */
  states: Array<QuestionState | undefined>;
  /** Right side of the header: answered count, streak chip. */
  trailing?: React.ReactNode;
}

/**
 * "Question 3 of 9" over a bar with one segment per question, coloured by result. Each header
 * phrase is nowrap and the row wraps between phrases, so a narrow Studio panel stacks them
 * cleanly instead of splitting a number from its words (#177).
 */
export function QuestionProgress({ currentIndex, states, trailing }: QuestionProgressProps) {
  const total = states.length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <span className="whitespace-nowrap">
          Question {currentIndex + 1} of {total}
        </span>
        {trailing}
      </div>
      <div
        role="progressbar"
        aria-label="Question progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={currentIndex + 1}
        aria-valuetext={`Question ${currentIndex + 1} of ${total}`}
        className="flex gap-1"
      >
        {states.map((state, position) => (
          <span
            key={position}
            data-state={state ?? (position === currentIndex ? "current" : "pending")}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-500 ease-out",
              state ? SEGMENT[state] : position === currentIndex ? "bg-primary/30" : "bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  );
}
