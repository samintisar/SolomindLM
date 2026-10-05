import type React from "react";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/cn";
import { Burst } from "../../motion/Burst";
import { useCountUp } from "../../motion/useCountUp";
import { scoreHeadline } from "./scoreHeadline";
import type { QuestionState } from "./types";

const RADIUS = 64;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const CHIP: Record<QuestionState, string> = {
  correct: "bg-success-muted text-success-muted-foreground",
  partial: "bg-warning-muted text-warning-muted-foreground",
  incorrect: "bg-destructive-muted text-destructive-muted-foreground",
  answered: "bg-muted text-muted-foreground",
};

interface ResultsSummaryProps {
  title: string;
  /** 0–1: fills the ring and picks the headline. */
  fraction: number;
  /** The big number in the ring; counts up from 0. */
  value: number;
  /** Appended to the number in the same text, e.g. "%". */
  valueSuffix?: string;
  /** Small line under the number, e.g. "of 9". */
  caption?: string;
  /** One chip per question; tapping it reviews that question. */
  questions: Array<{ state: QuestionState | undefined; onReview: () => void }>;
  /** Score sentence and notes. Static text, so screen readers and tests get the final numbers. */
  children: React.ReactNode;
  actions: React.ReactNode;
}

/** End of a quiz or written set: the ring fills while the number counts up; a perfect score bursts. */
export function ResultsSummary({
  title,
  fraction,
  value,
  valueSuffix = "",
  caption,
  questions,
  children,
  actions,
}: ResultsSummaryProps) {
  const shown = useCountUp(value);
  const ring = useCountUp(Math.round(fraction * 1000), 1100) / 1000;

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300">
      <Card className="w-full max-w-md">
        <div className="flex flex-col items-center gap-6 px-6 text-center">
          <div className="relative size-36">
            <svg viewBox="0 0 150 150" className="size-full -rotate-90" aria-hidden>
              <circle
                cx="75"
                cy="75"
                r={RADIUS}
                fill="none"
                strokeWidth="10"
                className="stroke-muted"
              />
              <circle
                cx="75"
                cy="75"
                r={RADIUS}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                className="stroke-success"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - ring)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-4xl font-semibold tabular-nums">{`${shown}${valueSuffix}`}</span>
              {caption ? (
                <span className="font-sans text-xs text-muted-foreground">{caption}</span>
              ) : null}
            </div>
            {fraction >= 1 ? <Burst /> : null}
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-2xl font-semibold">{title}</h3>
            <p className="font-display text-lg text-primary">{scoreHeadline(fraction)}</p>
            {children}
          </div>
          {questions.length > 0 ? (
            <div
              role="group"
              aria-label="Review a question"
              className="flex flex-wrap justify-center gap-1.5"
            >
              {questions.map((question, position) => (
                <button
                  key={position}
                  type="button"
                  data-state={question.state ?? "unanswered"}
                  aria-label={`Review question ${position + 1}`}
                  onClick={question.onReview}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg font-sans text-xs font-semibold outline-hidden transition-transform animate-in fade-in slide-in-from-bottom-2 duration-300 focus-visible:ring-2 focus-visible:ring-ring motion-safe:hover:-translate-y-px",
                    question.state ? CHIP[question.state] : "bg-muted text-muted-foreground"
                  )}
                >
                  {position + 1}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex w-full gap-3">{actions}</div>
        </div>
      </Card>
    </div>
  );
}
