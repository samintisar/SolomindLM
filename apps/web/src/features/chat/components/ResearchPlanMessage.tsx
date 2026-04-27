import React, { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Check, Pencil, X, Loader2, CircleCheck, Ban, FlaskConical } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

interface SubQuestion {
  id: string;
  question: string;
  searchQueries: string[];
  sourceChannels: string[];
}

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

interface ResearchPlanMessageProps {
  planId: string;
  /** Populated while streaming before the plan row exists in the DB; after load, Convex query wins. */
  subQuestions: SubQuestion[];
  onApprove: (planId: string) => void;
  onReject: (planId: string) => void;
}

export const ResearchPlanMessage: React.FC<ResearchPlanMessageProps> = ({
  planId,
  subQuestions,
  onApprove,
  onReject,
}) => {
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const plan = useQuery(api.research.index.getPlan, {
    planId: planId as Id<"researchPlans">,
  });

  const planStatus = plan?.status as string | undefined;
  const isDraft = planStatus === "draft" || planStatus === undefined;
  const isRejected = planStatus === "rejected";
  const isApproved = planStatus === "approved";

  const latestRun = useQuery(
    api.research.index.getLatestRunForPlan,
    isApproved ? { planId: planId as Id<"researchPlans"> } : "skip"
  );

  const runState = latestRun?.status as string | undefined;
  const runsQueryLoading = isApproved && latestRun === undefined;
  const runRowMissing = isApproved && latestRun === null;
  const runInFlight =
    isApproved &&
    latestRun != null &&
    (runState === "pending" || runState === "running");
  const runSucceeded = isApproved && latestRun != null && runState === "completed";
  const runFailed = isApproved && latestRun != null && runState === "failed";
  const showProgressSpinner = runsQueryLoading || runRowMissing || runInFlight;

  const displaySubQuestions = useMemo(() => {
    if (plan?.subQuestions && Array.isArray(plan.subQuestions) && plan.subQuestions.length > 0) {
      return normalizeSubQuestions(plan.subQuestions as unknown[]);
    }
    if (subQuestions.length > 0) {
      return subQuestions;
    }
    return [];
  }, [plan, subQuestions]);

  const loadingFromServer = plan === undefined && displaySubQuestions.length === 0;
  const missingPlan = plan === null && displaySubQuestions.length === 0;

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await onApprove(planId);
    } finally {
      setSubmitting(false);
    }
  };

  const cardClass =
    isRejected
      ? "border-border/80 bg-muted/25 shadow-none"
      : runFailed
        ? "border-destructive/25 bg-gradient-to-b from-destructive/[0.06] to-card shadow-sm"
        : runSucceeded
          ? "border-success/25 bg-gradient-to-b from-success/[0.07] via-card to-card shadow-sm"
          : "border-primary/25 bg-card shadow-sm";

  const headerEyebrow = isRejected
    ? "Plan status"
    : runSucceeded
      ? "Research plan"
      : runFailed
        ? "Research plan"
        : runInFlight
          ? "Research plan"
          : runsQueryLoading || runRowMissing
            ? "Research plan"
            : "Research plan";

  const headerTitle = isRejected
    ? "Dismissed"
    : runSucceeded
      ? "Research complete"
      : runFailed
        ? "Run failed"
        : runInFlight
          ? "In progress"
          : runsQueryLoading
            ? "Loading…"
            : runRowMissing
              ? "Starting…"
              : "Ready for review";

  const headerSubtitle =
    isApproved && !isRejected
      ? runSucceeded
        ? "Your findings are in the next assistant reply—scroll down to read the full report."
        : runFailed
          ? "Something went wrong. Ask a follow-up in chat, or start a new deep research run."
          : runInFlight
            ? "Gathering sources and drafting the report. This can take a minute."
            : runRowMissing || runsQueryLoading
              ? "Spinning up the research run…"
              : null
      : isRejected
        ? "This plan was cancelled. You can still chat normally."
        : null;

  const iconWellClass = isRejected
    ? "bg-muted text-muted-foreground ring-1 ring-border/60"
    : runSucceeded
      ? "bg-success/15 text-success ring-1 ring-success/25"
      : runFailed
        ? "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
        : showProgressSpinner
          ? "bg-primary/12 text-primary ring-1 ring-primary/20"
          : "bg-primary/10 text-primary ring-1 ring-primary/25";

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconWellClass}`}
            aria-hidden
          >
            {runSucceeded ? (
              <CircleCheck className="size-5 stroke-[2.25]" />
            ) : isRejected ? (
              <Ban className="size-[18px]" />
            ) : showProgressSpinner ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <FlaskConical className="size-5" />
            )}
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {headerEyebrow}
            </p>
            <h4 className="mt-1 font-semibold text-base text-foreground leading-snug tracking-tight">
              {headerTitle}
            </h4>
            {headerSubtitle ? (
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{headerSubtitle}</p>
            ) : null}
          </div>
        </div>
        {isDraft && (
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="p-2 rounded-xl hover:bg-muted/90 transition-colors shrink-0 text-muted-foreground hover:text-foreground"
            title={editing ? "Cancel editing" : "Edit plan"}
          >
            {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
        )}
      </div>

      <div className="space-y-2 border-t border-border/60 pt-4">
        {loadingFromServer ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            Loading plan…
          </div>
        ) : missingPlan ? (
          <p className="text-sm text-muted-foreground py-2">
            Could not load this research plan. Try refreshing the page.
          </p>
        ) : null}
        {displaySubQuestions.map((sq, index) => (
          <div key={sq.id} className="flex gap-3 items-start text-sm">
            <span className="shrink-0 w-7 h-7 rounded-lg bg-muted/80 text-foreground/80 flex items-center justify-center text-xs font-semibold tabular-nums ring-1 ring-border/50">
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-foreground">{sq.question}</p>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {sq.sourceChannels.map((ch) => (
                  <span
                    key={ch}
                    className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  >
                    {ch}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isDraft && (
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={handleApprove}
            disabled={submitting || displaySubQuestions.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Approve & Research
          </button>
          <button
            type="button"
            onClick={() => onReject(planId)}
            disabled={submitting}
            className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};
