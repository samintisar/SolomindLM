import React, { useState, useEffect, useCallback } from "react";
import type { Id } from "@convex/_generated/dataModel";
import {
  Check,
  Loader2,
  X,
  ChevronDown,
  Search,
  ListFilter,
  Database,
  FileText,
  Table2,
  LayoutGrid,
  Circle,
} from "lucide-react";
import {
  extractSearchQueriesFromDetails,
  type LiteratureReviewStepCounts,
  type ResearchStep,
} from "./researchStepTypes";
import {
  canOpenRankedPapersDrilldown,
  canOpenScreeningDrilldown,
} from "../utils/literatureReviewStepDrilldown";

const STEP_ICONS: Record<string, React.ElementType> = {
  planning: Search,
  searching: Search,
  deduplicating: ListFilter,
  ranking: ListFilter,
  screening: LayoutGrid,
  extracting: Database,
  populating: Table2,
  generating_report: FileText,
  awaiting_user_input: Circle,
  awaiting_columns: Circle,
};

const QUERY_PILL_CLASS =
  "flex w-full min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-3 py-2.5 text-xs font-normal text-foreground/90";

const PILL_CLASS =
  "inline-flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-3 py-2 text-xs font-normal text-foreground/90";

interface LiteratureReviewStepsProps {
  steps: ResearchStep[];
  /** When true, expand every step (e.g. completed literature review). */
  expandAll?: boolean;
  sessionId?: Id<"literatureReviewSessions">;
  onOpenRankedPapers?: (sessionId: Id<"literatureReviewSessions">) => void;
  onOpenScreeningDecisions?: (sessionId: Id<"literatureReviewSessions">) => void;
}

export const LiteratureReviewSteps: React.FC<LiteratureReviewStepsProps> = ({
  steps,
  expandAll = false,
  sessionId,
  onOpenRankedPapers,
  onOpenScreeningDecisions,
}) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    steps.forEach((_, idx) => {
      if (expandAll) {
        initial.add(idx);
      }
    });
    if (initial.size > 0) return initial;
    steps.forEach((step, idx) => {
      if (step.status === "in_progress" || step.status === "completed") {
        initial.add(idx);
      }
    });
    return initial;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedSteps((prev) => {
      const next = expandAll ? new Set(steps.map((_, idx) => idx)) : new Set(prev);
      if (!expandAll) {
        steps.forEach((step, idx) => {
          if (step.status === "in_progress") {
            next.add(idx);
          }
        });
      }
      return next;
    });
  }, [steps, expandAll]);

  const toggleStep = useCallback((index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span>Starting research...</span>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const isExpanded = expandedSteps.has(index);
        const isLast = index === steps.length - 1;

        return (
          <div key={`${step.type}-${index}`} className="relative flex gap-4">
            {/* Timeline column */}
            <div className="relative flex w-6 shrink-0 flex-col items-center pt-0.5">
              {!isLast && (
                <div
                  className="pointer-events-none absolute top-7 bottom-0 w-px bg-border/70"
                  style={{ left: "50%", transform: "translateX(-50%)" }}
                  aria-hidden
                />
              )}
              <StepStatusIcon status={step.status} />
            </div>

            {/* Content */}
            <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-7"}`}>
              <button
                type="button"
                onClick={() => toggleStep(index)}
                className="group flex w-full items-start gap-1.5 text-left"
              >
                <span className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                  {step.title}
                </span>
                <ChevronDown
                  className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>

              {isExpanded && (
                <div className="mt-2 space-y-3">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                  {step.details || step.searchQueries?.length || step.prismaCounts ? (
                    <StepDetails
                      details={step.details}
                      stepType={step.type}
                      searchQueries={step.searchQueries}
                      papersFound={step.papersFound}
                      prismaCounts={step.prismaCounts}
                      sessionId={sessionId}
                      onOpenRankedPapers={onOpenRankedPapers}
                      onOpenScreeningDecisions={onOpenScreeningDecisions}
                    />
                  ) : null}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

function StepStatusIcon({ status }: { status: ResearchStep["status"] }) {
  const ring =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background";

  if (status === "completed") {
    return (
      <div className={ring}>
        <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-500" strokeWidth={2.5} />
      </div>
    );
  }
  if (status === "in_progress") {
    return (
      <div className={ring}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" strokeWidth={2} />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-destructive/30 bg-destructive/10">
        <X className="h-3.5 w-3.5 text-destructive" strokeWidth={2.5} />
      </div>
    );
  }
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border/60 bg-muted/40" />
  );
}

// ── Step Details ───────────────────────────────────────────────────────────

function PrismaCountsSummary({ counts }: { counts: LiteratureReviewStepCounts }) {
  const items: string[] = [];
  if (counts.recordsIdentified != null) {
    items.push(`${counts.recordsIdentified.toLocaleString()} identified`);
  }
  if (counts.recordsAfterDedupe != null) {
    items.push(`${counts.recordsAfterDedupe.toLocaleString()} after dedup`);
  }
  if (counts.recordsRanked != null) {
    items.push(`${counts.recordsRanked.toLocaleString()} ranked`);
  }
  if (counts.recordsScreened != null) {
    items.push(`${counts.recordsScreened.toLocaleString()} screened`);
  }
  if (counts.recordsIncluded != null) {
    items.push(`${counts.recordsIncluded.toLocaleString()} included`);
  }
  if (counts.recordsExcluded != null) {
    items.push(`${counts.recordsExcluded.toLocaleString()} excluded`);
  }
  if (counts.extractedRowCount != null) {
    items.push(`${counts.extractedRowCount.toLocaleString()} rows extracted`);
  }
  if (items.length === 0) return null;
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      {items.join(" · ")}
    </p>
  );
}

function StepDetails({
  details,
  stepType,
  searchQueries,
  papersFound,
  prismaCounts,
  sessionId,
  onOpenRankedPapers,
  onOpenScreeningDecisions,
}: {
  details?: string;
  stepType: string;
  searchQueries?: string[];
  papersFound?: number;
  prismaCounts?: LiteratureReviewStepCounts;
  sessionId?: Id<"literatureReviewSessions">;
  onOpenRankedPapers?: (sessionId: Id<"literatureReviewSessions">) => void;
  onOpenScreeningDecisions?: (sessionId: Id<"literatureReviewSessions">) => void;
}) {
  const queries =
    searchQueries && searchQueries.length > 0
      ? searchQueries
      : details
        ? (extractSearchQueriesFromDetails(details) ?? [])
        : [];

  if (queries.length > 0 && (stepType === "searching" || stepType === "planning")) {
    return (
      <div className="flex flex-col gap-2">
        {queries.map((q, i) => (
          <span key={i} className={QUERY_PILL_CLASS}>
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
            <span className="min-w-0 truncate">{q}</span>
          </span>
        ))}
        {papersFound != null && papersFound > 0 && (
          <p className="pt-0.5 text-xs text-muted-foreground">
            Found {papersFound.toLocaleString()} papers
          </p>
        )}
        {prismaCounts ? <PrismaCountsSummary counts={prismaCounts} /> : null}
      </div>
    );
  }

  if (
    prismaCounts &&
    (stepType === "screening" || stepType === "extracting" || stepType === "ranking")
  ) {
    const hasSession = Boolean(sessionId);
    const openRanked =
      details &&
      canOpenRankedPapersDrilldown(stepType, hasSession) &&
      sessionId &&
      onOpenRankedPapers;
    const openScreening =
      details &&
      canOpenScreeningDrilldown(stepType, hasSession) &&
      sessionId &&
      onOpenScreeningDecisions;

    const pillContent = (
      <>
        <StepIconForType stepType={stepType} />
        <span className="min-w-0">{details}</span>
      </>
    );

    return (
      <div className="flex flex-col gap-2">
        {details ? (
          openRanked || openScreening ? (
            <button
              type="button"
              onClick={
                openRanked
                  ? () => onOpenRankedPapers!(sessionId!)
                  : () => onOpenScreeningDecisions!(sessionId!)
              }
              className={`${PILL_CLASS} cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5`}
            >
              {pillContent}
            </button>
          ) : (
            <span className={PILL_CLASS}>{pillContent}</span>
          )
        ) : null}
        <PrismaCountsSummary counts={prismaCounts} />
      </div>
    );
  }

  if (
    details?.trim() === "Table generated" ||
    details?.trim() === "Report generation complete" ||
    /^Created table\b/i.test(details?.trim() ?? "")
  ) {
    return null;
  }

  if (
    details &&
    (stepType === "ranking" ||
      stepType === "screening" ||
      stepType === "populating" ||
      stepType === "extracting")
  ) {
    const hasSession = Boolean(sessionId);
    const openRanked =
      canOpenRankedPapersDrilldown(stepType, hasSession) && sessionId && onOpenRankedPapers;
    const openScreening =
      canOpenScreeningDrilldown(stepType, hasSession) && sessionId && onOpenScreeningDecisions;

    if (openRanked || openScreening) {
      const onClick = openRanked
        ? () => onOpenRankedPapers!(sessionId!)
        : () => onOpenScreeningDecisions!(sessionId!);

      return (
        <button
          type="button"
          onClick={onClick}
          className={`${PILL_CLASS} cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5`}
        >
          <StepIconForType stepType={stepType} />
          <span className="min-w-0">{details}</span>
        </button>
      );
    }

    return (
      <span className={PILL_CLASS}>
        <StepIconForType stepType={stepType} />
        <span className="min-w-0">{details}</span>
      </span>
    );
  }

  if (!details) return null;

  return <p className="text-xs leading-relaxed text-muted-foreground">{details}</p>;
}

function StepIconForType({ stepType }: { stepType: string }) {
  const Icon = STEP_ICONS[stepType] ?? Circle;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />;
}
