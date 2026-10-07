import { Check, FileText, Lightbulb, Sparkles } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { DemoLabel, DemoSurface } from "./DemoSurface";

const RATINGS = ["Again", "Hard", "Good"] as const;

export function FlashcardDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("p-4.5", className)}>
      <div className="flex items-center justify-between">
        <DemoLabel>Flashcard</DemoLabel>
        <DemoLabel>7 / 24</DemoLabel>
      </div>
      <p className="mt-3 font-display text-base leading-snug font-bold">
        Which receptor relaxes bronchial smooth muscle?
      </p>
      <p className="mt-3 rounded-xl bg-muted p-3 font-serif text-sm leading-relaxed">
        β<sub>2</sub>-adrenergic receptors, which is why β<sub>2</sub> agonists like salbutamol
        relieve asthma.
      </p>
      <div className="mt-3 grid grid-cols-4 gap-1.5 font-sans text-xs font-semibold">
        {RATINGS.map((rating) => (
          <span
            key={rating}
            className="rounded-lg bg-card py-1.5 text-center shadow-xs ring-1 ring-hairline"
          >
            {rating}
          </span>
        ))}
        <span className="rounded-lg bg-primary py-1.5 text-center text-primary-foreground">
          Easy
        </span>
      </div>
    </DemoSurface>
  );
}

const QUIZ_OPTIONS = [
  { label: "Propranolol", correct: false },
  { label: "Bisoprolol", correct: true },
  { label: "Nadolol", correct: false },
] as const;

export function QuizDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("p-4", className)}>
      <div className="flex items-center justify-between">
        <DemoLabel>Quiz · 4 of 15</DemoLabel>
        <span className="font-sans text-xs font-bold text-primary">4 / 4</span>
      </div>
      <p className="mt-2.5 font-display text-sm leading-snug font-bold">
        Which beta blocker is the safer choice in asthma?
      </p>
      <ul className="mt-2.5 space-y-1.5 font-serif text-xs">
        {QUIZ_OPTIONS.map((option) => (
          <li
            key={option.label}
            className={cn(
              "flex items-center justify-between rounded-lg px-2.5 py-1.5 ring-1",
              option.correct
                ? "bg-success-muted font-semibold text-success-muted-foreground ring-success/40"
                : "ring-hairline"
            )}
          >
            {option.label}
            {option.correct ? <Check className="size-3.5" /> : null}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 flex items-start gap-1.5 font-sans text-xs leading-snug text-muted-foreground">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-studio-report" />
        <span>
          Cardioselective: it mostly spares β<sub>2</sub> receptors in the airways.
        </span>
      </p>
    </DemoSurface>
  );
}

const DUE_BARS = ["h-3", "h-5", "h-4", "h-6", "h-5"] as const;

export function DueTodayDemo({ className }: { className?: string }) {
  return (
    <DemoSurface className={cn("p-4", className)}>
      <DemoLabel>Due today</DemoLabel>
      <p className="mt-1 font-display text-2xl font-bold">12 cards</p>
      <div className="mt-2 flex h-8 items-end gap-1">
        {DUE_BARS.map((height, index) => (
          <span key={index} className={cn("flex-1 rounded-sm bg-primary/60", height)} />
        ))}
        <span className="h-8 flex-1 rounded-sm bg-primary" />
      </div>
    </DemoSurface>
  );
}

/** Used twice: the hero callout and the "Practise it" beat. */
export function WrittenQuestionDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("p-4", className)}>
      <div className="flex items-center justify-between">
        <DemoLabel>Written question · 2 of 5</DemoLabel>
        <span className="rounded-full bg-success-muted px-2 py-0.5 font-sans text-xs font-bold text-success-muted-foreground">
          4 / 5
        </span>
      </div>
      <p className="mt-2.5 font-display text-sm leading-snug font-bold">
        Explain why a non-selective beta blocker can be dangerous for a patient with asthma.
      </p>
      <div className="mt-3 rounded-xl bg-muted/50 p-2.5 ring-1 ring-hairline ring-inset">
        <DemoLabel>Your answer</DemoLabel>
        <p className="mt-1 font-serif text-xs leading-relaxed">
          It blocks β<sub>2</sub> receptors in the lungs, so the airways can't relax and the patient
          may go into bronchospasm.
        </p>
      </div>
      <div className="mt-2 rounded-xl bg-success-muted p-2.5 text-success-muted-foreground">
        <p className="flex items-center gap-1.5 font-sans text-xs font-semibold tracking-wider uppercase">
          <Sparkles className="size-3" />
          Feedback
        </p>
        <p className="mt-1 font-serif text-xs leading-relaxed">
          Right mechanism. For full marks, name a safer cardioselective option, such as bisoprolol.
        </p>
        <p className="mt-1.5 flex items-center gap-1 font-sans text-xs font-semibold">
          <FileText className="size-3" />
          Lecture 12, slide 15
        </p>
      </div>
    </DemoSurface>
  );
}
