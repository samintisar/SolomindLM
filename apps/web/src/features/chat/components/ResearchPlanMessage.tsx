import type { Id } from "@convex/_generated/dataModel";
import { Ban, Check, FileSpreadsheet, FileText, FlaskConical, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/shared/components/ui/card";
import { Spinner } from "@/shared/components/ui/spinner";
import { useLiteratureReport, useLiteratureTable } from "../services/literatureReviewApi";
import { useLatestRunForPlan, useResearchPlan, useResearchSteps } from "../services/researchApi";
import { mapDeepResearchSteps } from "../utils/deepResearchSteps";
import { LiteratureReviewSteps } from "./LiteratureReviewSteps";
import { ResultCard } from "./ResultCard";

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
  onOpenTable,
  onOpenReport,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const plan = useResearchPlan(planId);

  const planStatus = plan?.status as string | undefined;
  const isDraft = planStatus === "draft" || planStatus === undefined;
  const isRejected = planStatus === "rejected";
  const isApproved = planStatus === "approved";

  const latestRun = useLatestRunForPlan(planId, isApproved);

  const tableId = latestRun?.tableId as Id<"literatureTables"> | undefined;
  const reportId = latestRun?.reportId as Id<"literatureReports"> | undefined;
  const table = useLiteratureTable(tableId ?? null);
  const report = useLiteratureReport(reportId ?? null);

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
  const showSteps = isApproved && !isRejected && (steps.length > 0 || runInFlight || runRowMissing);

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

  const planTitle =
    typeof plan?.researchTitle === "string" && plan.researchTitle.trim().length > 0
      ? plan.researchTitle.trim()
      : null;

  const headerTitle = isRejected
    ? "Plan dismissed"
    : runFailed
      ? "Run failed"
      : (planTitle ?? "Research plan");

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

  const showArtifacts =
    runSucceeded && (tableId !== undefined || reportId !== undefined) && plan?.notebookId;

  return (
    <div className="w-full max-w-3xl space-y-6">
      {showSteps ? <LiteratureReviewSteps steps={steps} expandAll={runSucceeded} /> : null}

      {showArtifacts ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {tableId ? (
            <ResultCard
              icon={FileSpreadsheet}
              title={table?.title ?? "Evidence Table"}
              description="Table"
              onOpen={() => onOpenTable?.(tableId)}
            />
          ) : null}
          {reportId ? (
            <ResultCard
              icon={FileText}
              title={report?.title ?? "Deep Research Report"}
              description="Document"
              onOpen={() => onOpenReport?.(reportId)}
            />
          ) : null}
        </div>
      ) : null}

      {showStatusCard ? (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <StatusIcon className={`mt-0.5 size-5 shrink-0 ${statusIconClass}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="font-sans text-base font-semibold tracking-tight text-foreground">
                  {headerTitle}
                </h3>
                {headerSubtitle ? (
                  <p className="mt-1 font-sans text-sm leading-relaxed text-muted-foreground">
                    {headerSubtitle}
                  </p>
                ) : null}
              </div>
            </div>
          </CardHeader>

          {isDraft ? (
            <CardContent>
              <ul className="divide-y divide-border font-sans">
                {loadingFromServer ? (
                  <li className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                    <Spinner className="shrink-0" />
                    Loading plan…
                  </li>
                ) : missingPlan ? (
                  <li className="py-3 text-sm text-muted-foreground">
                    Could not load this research plan. Try refreshing the page.
                  </li>
                ) : (
                  displaySubQuestions.map((sq, index) => (
                    <li key={sq.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <Badge variant="secondary" className="mt-0.5" aria-hidden>
                          {index + 1}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug text-foreground">
                            {sq.question}
                          </p>
                          {sq.sourceChannels.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {sq.sourceChannels.map((ch) => (
                                <Badge key={ch} variant="outline">
                                  {channelLabel(ch)}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          ) : null}

          {isDraft && !loadingFromServer && !missingPlan && (
            <CardFooter>
              <div className="flex w-full flex-col gap-3 font-sans sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">
                    {displaySubQuestions.length}
                  </span>
                  {displaySubQuestions.length === 1 ? " sub-question" : " sub-questions"}
                </p>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => onReject(planId)}
                    disabled={submitting}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={submitting || displaySubQuestions.length === 0}
                    className="w-full sm:w-auto"
                  >
                    {submitting ? (
                      <>
                        <Spinner aria-hidden />
                        Starting…
                      </>
                    ) : (
                      <>
                        <Check aria-hidden strokeWidth={2.5} />
                        Approve & Research
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardFooter>
          )}
        </Card>
      ) : null}
    </div>
  );
};
