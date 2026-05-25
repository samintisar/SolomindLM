import React, { useMemo, useState } from "react";
import { Check, Loader2, Ban, FlaskConical, X } from "lucide-react";
import { LiteratureReviewSteps } from "./LiteratureReviewSteps";
import { mapDeepResearchSteps } from "../utils/deepResearchSteps";
import type { Id } from "@convex/_generated/dataModel";
import {
  useResearchPlan,
  useLatestRunForPlan,
  useResearchSteps,
} from "../services/researchApi";

interface SubQuestion {
  id: string;
  question: string;
  searchQueries: string[];
  sourceChannels: string[];
}

const CHANNEL_LABELS: Record<string, string> = {
  notebook: "Notebook",
  web: "Web",
  academic: "Academic",
  news: "News",
};

const CHANNEL_PILL_CLASS =
  "inline-flex max-w-full items-center rounded-lg border border-border/70 bg-muted/50 px-2.5 py-1 text-xs font-normal text-foreground/90";

function normalizeSubQuestions(raw: unknown[]): SubQuestion[] {
  return raw
    .filter(
      (x): x is Record<string, unknown> =>
        x != null && typeof x === "object" && typeof (x as Record<string, unknown>).id === "string"
    )
    .map((x) => ({
      id: x.id as string,
      question: String(x.question ?? ""),
      searchQueries: Array.isArray(x.searchQueries) ? (x.searchQueries as string[]) : [],
      sourceChannels: Array.isArray(x.sourceChannels) ? (x.sourceChannels as string[]) : [],
    }));
}

function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

interface ResearchPlanMessageProps {
  planId: string;
  /** Populated while streaming before the plan row exists in the DB; after load, Convex query wins. */
  subQuestions: SubQuestion[];
  onApprove: (planId: string) => void;
  onReject: (planId: string) => void;
  /** @deprecated Legacy runs only — new deep research does not create table/report artifacts */
  onOpenTable?: (tableId: Id<"literatureTables">) => void;
  /** @deprecated Legacy runs only */
  onOpenReport?: (reportId: Id<"literatureReports">) => void;
}

export const ResearchPlanMessage: React.FC<ResearchPlanMessageProps> = ({
  planId,
  subQuestions,
  onApprove,
  onReject,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const plan = useResearchPlan(planId);

  const planStatus = plan?.status as string | undefined;
  const isDraft = planStatus === "draft" || planStatus === undefined;
  const isRejected = planStatus === "rejected";
  const isApproved = planStatus === "approved";

  const latestRun = useLatestRunForPlan(planId, isApproved);

  const runState = latestRun?.status as string | undefined;
  const runRowMissing = isApproved && latestRun === null;
  const runInFlight =
    isApproved && latestRun != null && (runState === "pending" || runState === "running");
  const runSucceeded = isApproved && latestRun != null && runState === "completed";
  const runFailed = isApproved && latestRun != null && runState === "failed";

  const stepsData = useResearchSteps(
    latestRun ? String(latestRun._id) : null,
    plan?.notebookId ?? null
  );

  const displaySubQuestions = useMemo(() => {
    if (plan?.subQuestions && Array.isArray(plan.subQuestions) && plan.subQuestions.length > 0) {
      return normalizeSubQuestions(plan.subQuestions as unknown[]);
    }
    if (subQuestions.length > 0) {
      return subQuestions;
    }
    return [];
  }, [plan, subQuestions]);

  const steps = useMemo(() => {
    if (!stepsData) return [];
    return mapDeepResearchSteps(stepsData, displaySubQuestions);
  }, [stepsData, displaySubQuestions]);

  const loadingFromServer = plan === undefined && displaySubQuestions.length === 0;
  const missingPlan = plan === null && displaySubQuestions.length === 0;
  const showSteps =
    isApproved && !isRejected && (steps.length > 0 || runInFlight || runRowMissing);

  /** Plan review (draft), dismiss, and failure only—timeline + artifacts cover success. */
  const showStatusCard = isDraft || isRejected || runFailed;

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await onApprove(planId);
    } finally {
      setSubmitting(false);
    }
  };

  const cardBorderClass = isRejected
    ? "border-border"
    : runFailed
      ? "border-destructive/25"
      : "border-border";

  const headerTitle = isRejected
    ? "Plan dismissed"
    : runFailed
      ? "Run failed"
      : "Research plan";

  const headerSubtitle = isRejected
    ? "This plan was cancelled. You can still chat normally."
    : runFailed
      ? "Something went wrong. Ask a follow-up in chat, or start a new deep research run."
      : "Review the sub-questions below, then approve to start deep research.";

  const StatusIcon = isRejected ? Ban : runFailed ? X : FlaskConical;

  const statusIconClass = isRejected
    ? "text-muted-foreground"
    : runFailed
      ? "text-destructive"
      : "text-primary";

  return (
    <div className="w-full max-w-3xl space-y-6">
      {showSteps ? (
        <LiteratureReviewSteps steps={steps} expandAll={runSucceeded} />
      ) : null}

      {showStatusCard ? (
      <div
        className={`overflow-hidden rounded-xl border bg-card font-sans ${cardBorderClass}`}
      >
        <div className="border-b border-border px-4 py-3.5 sm:px-5">
          <div className="flex items-start gap-3">
            <StatusIcon className={`mt-0.5 size-5 shrink-0 ${statusIconClass}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                {headerTitle}
              </h3>
              {headerSubtitle ? (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {headerSubtitle}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {isDraft ? (
          <ul className="divide-y divide-border">
            {loadingFromServer ? (
              <li className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground sm:px-5">
                <Loader2 className="size-4 shrink-0 animate-spin" />
                Loading plan…
              </li>
            ) : missingPlan ? (
              <li className="px-4 py-4 text-sm text-muted-foreground sm:px-5">
                Could not load this research plan. Try refreshing the page.
              </li>
            ) : (
              displaySubQuestions.map((sq, index) => (
                <li key={sq.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/80 text-xs font-semibold tabular-nums text-foreground/80 ring-1 ring-border/50"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-foreground">
                        {sq.question}
                      </p>
                      {sq.sourceChannels.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {sq.sourceChannels.map((ch) => (
                            <span key={ch} className={CHANNEL_PILL_CLASS}>
                              {channelLabel(ch)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        ) : null}

        {isDraft && !loadingFromServer && !missingPlan && (
          <div className="flex flex-col gap-3 border-t border-border bg-muted px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">
                {displaySubQuestions.length}
              </span>
              {displaySubQuestions.length === 1 ? " sub-question" : " sub-questions"}
            </p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={() => onReject(planId)}
                disabled={submitting}
                className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={submitting || displaySubQuestions.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>
                    <Check className="size-4" strokeWidth={2.5} />
                    Approve & Research
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      ) : null}
    </div>
  );
};

