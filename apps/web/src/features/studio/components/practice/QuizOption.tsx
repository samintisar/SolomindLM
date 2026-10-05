import { cva } from "class-variance-authority";
import type React from "react";
import { cn } from "@/shared/utils/cn";
import { Burst } from "../../motion/Burst";

export type OptionState = "idle" | "correct" | "incorrect" | "dimmed";

const optionVariants = cva(
  "group relative flex w-full items-center gap-3 rounded-xl p-4 text-left font-serif shadow-xs ring-1 transition duration-200 ease-out outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default md:p-5",
  {
    variants: {
      state: {
        idle: "bg-card ring-hairline hover:shadow-md motion-safe:hover:-translate-y-px motion-safe:active:scale-99",
        correct: "bg-success-muted text-success-muted-foreground ring-success-border",
        incorrect:
          "bg-destructive-muted text-destructive-muted-foreground ring-destructive-border animate-studio-shake",
        dimmed: "bg-card opacity-50 ring-hairline",
      },
    },
  }
);

const keyVariants = cva(
  "flex size-7 shrink-0 items-center justify-center rounded-lg font-sans text-xs font-semibold transition-colors",
  {
    variants: {
      state: {
        idle: "bg-muted text-muted-foreground",
        correct: "bg-success text-success-foreground",
        incorrect: "bg-destructive text-destructive-foreground",
        dimmed: "bg-muted text-muted-foreground",
      },
    },
  }
);

interface QuizOptionProps {
  /** 0-based; shown as A, B, C… */
  position: number;
  state: OptionState;
  disabled: boolean;
  /** The option the learner just got right: plays a gentle pop and a burst once. */
  celebrate?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}

/** One multiple-choice answer: lifts on hover, then turns green with a drawn tick or shakes red. */
export function QuizOption({
  position,
  state,
  disabled,
  celebrate = false,
  onSelect,
  children,
}: QuizOptionProps) {
  return (
    <button
      type="button"
      data-state={state}
      disabled={disabled}
      onClick={onSelect}
      className={cn(optionVariants({ state }), celebrate && "animate-studio-select-pop")}
    >
      <span aria-hidden className={keyVariants({ state })}>
        {String.fromCharCode(65 + position)}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {state === "correct" ? <span className="sr-only">Correct answer</span> : null}
      {state === "incorrect" ? <span className="sr-only">Your answer, incorrect</span> : null}
      {state === "correct" || state === "incorrect" ? <ResultMark state={state} /> : null}
      {celebrate ? <Burst /> : null}
    </button>
  );
}

function ResultMark({ state }: { state: "correct" | "incorrect" }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={state === "correct" ? "M5 12.5l4.5 4.5L19 7.5" : "M7 7l10 10M17 7L7 17"}
        strokeDasharray={30}
        className="animate-studio-draw"
      />
    </svg>
  );
}
