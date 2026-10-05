import type { Id } from "@convex/_generated/dataModel";
import { Check, FileSpreadsheet, FileText, Plus, X } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Spinner } from "@/shared/components/ui/spinner";
import { useToast } from "@/shared/contexts/useToast";
import type { Message } from "@/shared/types/index";
import {
  useConfirmLiteratureReviewColumns,
  useLiteratureReport,
  useLiteratureReviewSession,
  useLiteratureTable,
  useRetryLiteratureReview,
} from "../services/literatureReviewApi";
import { useResearchSteps } from "../services/researchApi";
import { buildLiteratureReportChatPreview } from "../utils/literatureReportPreview";
import {
  countNotebookAndSearchPapers,
  includedPapersPhrase,
  paperScopeLabel,
} from "../utils/literatureReviewPapers";
import { ControlTooltip } from "./ControlTooltip";
import { LiteratureReviewSteps } from "./LiteratureReviewSteps";
import { ResultCard } from "./ResultCard";
import {
  extractSearchQueriesFromDetails,
  parseResearchStepMetadata,
  type ResearchStep,
} from "./researchStepTypes";

/** Steps shown in the chat timeline (matches reference UI). */
const VISIBLE_LITERATURE_STEP_TYPES = new Set([
  "searching",
  "ranking",
  "screening",
  "extracting",
  "populating",
]);

const stepConfig: Record<string, { title: string; description: string }> = {
  planning: {
    title: "Planning Research",
    description: "Defining search strategy and sub-questions...",
  },
  searching: {
    title: "Searching relevant studies",
    description:
      "Run structured searches based on the question to gather high-quality and relevant studies.",
  },
  deduplicating: {
    title: "Removing Duplicates",
    description: "Consolidating results across searches...",
  },
  ranking: {
    title: "Ranking candidate papers",
    description:
      "Refine and rank the most relevant studies based on their quality, impact, and relevance to your question.",
  },
  screening: {
    title: "Screening the selected studies",
    description:
      "Review papers against the eligibility criteria and record clear include/exclude decisions.",
  },
  extracting: {
    title: "Extracting data and structuring the evidence",
    description:
      "Extract the required information from included studies and organize it into a consistent format.",
  },
  populating: {
    title: "Populating extracted data into cells",
    description:
      "Analyze each study and extract key insights to fill in the table cells with relevant information.",
  },
  generating_report: {
    title: "Generating Report",
    description: "Writing literature review and synthesis...",
  },
  awaiting_user_input: {
    title: "Awaiting Input",
    description: "Waiting for user approval or guidance...",
  },
  awaiting_columns: {
    title: "Confirming Columns",
    description: "Review and customize the suggested extraction columns",
  },
};

interface LiteratureReviewMessageProps {
  message: Message;
  onOpenTable?: (tableId: Id<"literatureTables">) => void;
  onOpenReport?: (reportId: Id<"literatureReports">) => void;
  onOpenRankedPapers?: (sessionId: Id<"literatureReviewSessions">) => void;
  onOpenScreeningDecisions?: (sessionId: Id<"literatureReviewSessions">) => void;
}

export const LiteratureReviewMessage: React.FC<LiteratureReviewMessageProps> = ({
  message,
  onOpenTable,
  onOpenReport,
  onOpenRankedPapers,
  onOpenScreeningDecisions,
}) => {
  const lr = message.literatureReview;
  const sessionId = (lr?.sessionId ?? null) as Id<"literatureReviewSessions"> | null;

  const session = useLiteratureReviewSession(sessionId);

  const stepsData = useResearchSteps(
    sessionId && session?.notebookId ? sessionId : null,
    session?.notebookId ?? null
  );

  const tableId = (session?.tableId ?? lr?.tableId) as string | undefined;
  const reportId = (session?.reportId ?? lr?.reportId) as string | undefined;

  const table = useLiteratureTable(tableId ?? null);

  const report = useLiteratureReport(reportId ?? null);

  const { error: toastError } = useToast();
  const confirmColumnsMutation = useConfirmLiteratureReviewColumns();
  const retryMutation = useRetryLiteratureReview();

  const [editingColumns, setEditingColumns] = useState<Array<{
    id: string;
    name: string;
    instructions?: string;
    isVisible: boolean;
  }> | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isConfirmingColumns, setIsConfirmingColumns] = useState(false);

  type EditableColumn = {
    id: string;
    name: string;
    instructions?: string;
    isVisible: boolean;
  };

  const defaultColumnsFromSession = useCallback((): EditableColumn[] => {
    const cols = session?.suggestedColumns ?? lr?.suggestedColumns;
    if (!cols) return [];
    return cols.map((col: { id: string; name: string; instructions?: string }) => ({
      id: col.id,
      name: col.name,
      instructions: col.instructions,
      isVisible: true,
    }));
  }, [session?.suggestedColumns, lr?.suggestedColumns]);

  const patchEditingColumns = useCallback(
    (updater: (columns: EditableColumn[]) => EditableColumn[]) => {
      setEditingColumns((prev) => updater(prev ?? defaultColumnsFromSession()));
    },
    [defaultColumnsFromSession]
  );

  const suggestedColumns = useMemo(() => {
    if (editingColumns) return editingColumns;
    const cols = session?.suggestedColumns ?? lr?.suggestedColumns;
    if (!cols) return null;
    return cols.map((col: { id: string; name: string; instructions?: string }) => ({
      id: col.id,
      name: col.name,
      instructions: col.instructions,
      isVisible: true,
    }));
  }, [session?.suggestedColumns, lr?.suggestedColumns, editingColumns]);

  const steps: ResearchStep[] = useMemo(() => {
    if (!stepsData) return [];

    const planningStep = stepsData.find(
      (step: { stepType: string }) => step.stepType === "planning"
    );
    const planningQueries = planningStep
      ? (parseResearchStepMetadata(planningStep.metadata).searchQueries ??
        (planningStep.details ? extractSearchQueriesFromDetails(planningStep.details) : undefined))
      : undefined;

    return stepsData
      .filter((step: { stepType: string }) => VISIBLE_LITERATURE_STEP_TYPES.has(step.stepType))
      .map((step: { stepType: string; status: string; details?: string; metadata?: unknown }) => {
        const { searchQueries, papersFound, prismaCounts } = parseResearchStepMetadata(
          step.metadata
        );
        const detailsQueries = step.details
          ? extractSearchQueriesFromDetails(step.details)
          : undefined;
        const resolvedQueries =
          searchQueries ??
          detailsQueries ??
          (step.stepType === "searching" ? planningQueries : undefined);
        const foundMatch = step.details?.match(/^Found\s+([\d,]+)\s+papers\b/i);
        const resolvedPapersFound =
          papersFound ??
          (foundMatch ? Number.parseInt(foundMatch[1].replace(/,/g, ""), 10) : undefined);

        return {
          type: step.stepType,
          status: step.status as ResearchStep["status"],
          title: stepConfig[step.stepType]?.title || step.stepType,
          description: stepConfig[step.stepType]?.description || "",
          details: step.details,
          searchQueries: resolvedQueries,
          papersFound: resolvedPapersFound,
          prismaCounts,
        };
      });
  }, [stepsData]);

  const reportPreview = useMemo(() => {
    if (!report) return null;
    return buildLiteratureReportChatPreview(report);
  }, [report]);

  const handleConfirmColumns = useCallback(async () => {
    if (!suggestedColumns) return;
    setIsConfirmingColumns(true);
    try {
      await confirmColumnsMutation({
        sessionId: sessionId!,
        confirmedColumns: suggestedColumns,
      });
      setEditingColumns(null);
    } catch (err) {
      // Keep the edited columns so the user can retry.
      console.error("[LiteratureReview] Confirm columns failed:", err);
      toastError("Couldn't confirm the columns. Please try again.");
    } finally {
      setIsConfirmingColumns(false);
    }
  }, [confirmColumnsMutation, sessionId, suggestedColumns, toastError]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      await retryMutation({ sessionId: sessionId! });
    } catch (err) {
      console.error("[LiteratureReview] Retry failed:", err);
      toastError("Couldn't retry the literature review. Please try again.");
    } finally {
      setIsRetrying(false);
    }
  }, [retryMutation, sessionId, toastError]);

  if (!lr) return null;

  const status = session?.status ?? lr.status;
  const tableIdResolved = session?.tableId ?? lr.tableId;
  const reportIdResolved = session?.reportId ?? lr.reportId;
  const error = session?.error ?? lr.error;
  const notebookId = session?.notebookId;

  const isComplete = status === "completed";
  const isFailed = status === "failed";
  const isAwaitingColumns = status === "awaiting_columns";
  const showSteps = steps.length > 0 || (!isComplete && !isFailed);

  const includedPapers = countNotebookAndSearchPapers(table?.papers ?? []);
  const notebookPaperCount = session?.documentIds?.length ?? 0;
  const visibleColumnCount =
    table?.columns.filter((c: { isVisible: boolean }) => c.isVisible).length ?? 0;

  return (
    <div className="w-full max-w-3xl">
      {/* Pipeline timeline — stays visible when complete (reference UI) */}
      {showSteps && (
        <div className="mb-6">
          <LiteratureReviewSteps
            steps={steps}
            expandAll={isComplete}
            sessionId={sessionId ?? undefined}
            onOpenRankedPapers={onOpenRankedPapers}
            onOpenScreeningDecisions={onOpenScreeningDecisions}
          />
        </div>
      )}

      {/* Column confirmation */}
      {isAwaitingColumns && suggestedColumns && (
        <ColumnConfirmationCard
          columns={suggestedColumns}
          paperScopeSummary={
            notebookPaperCount > 0
              ? paperScopeLabel(session?.paperScope ?? "papers_and_search", notebookPaperCount)
              : undefined
          }
          isConfirming={isConfirmingColumns}
          onPatch={patchEditingColumns}
          onConfirm={handleConfirmColumns}
        />
      )}

      {/* Artifact cards — real titles, table then document */}
      {isComplete && (tableIdResolved || reportIdResolved) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {tableIdResolved && notebookId && (
            <ResultCard
              icon={FileSpreadsheet}
              title={table?.title ?? "Literature Table"}
              description="Table"
              onOpen={() => onOpenTable?.(tableIdResolved)}
            />
          )}
          {reportIdResolved && notebookId && (
            <ResultCard
              icon={FileText}
              title={report?.title ?? "Literature Report"}
              description="Document"
              onOpen={() => onOpenReport?.(reportIdResolved)}
            />
          )}
        </div>
      )}

      {/* Completion summary + report preview (below cards) */}
      {isComplete && table && (
        <div className="mt-8 text-base leading-relaxed text-foreground">
          <p>
            I&apos;ve created your literature review table with{" "}
            <strong>{includedPapersPhrase(includedPapers)}</strong> and{" "}
            <strong>{visibleColumnCount} columns</strong>
            {report
              ? ". Now I'll generate a comprehensive report summarizing the key findings across all papers..."
              : ". Open the table above to review and edit the extracted data."}
          </p>
          {reportPreview && (
            <p className="mt-4 text-base leading-relaxed text-foreground">{reportPreview}</p>
          )}
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <Alert variant="destructive">
          <AlertTitle>Literature Review Failed</AlertTitle>
          <AlertDescription>
            <p>{error || "Something went wrong during the research process."}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={isRetrying}
              className="mt-2"
            >
              {isRetrying ? (
                <>
                  <Spinner aria-hidden />
                  Retrying...
                </>
              ) : (
                "Retry from last step"
              )}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

// ── Column confirmation ────────────────────────────────────────────────────

type ColumnRow = {
  id: string;
  name: string;
  instructions?: string;
  isVisible: boolean;
};

interface ColumnConfirmationCardProps {
  columns: ColumnRow[];
  /** "Your 4 papers + search" when the review includes the user's notebook papers. */
  paperScopeSummary?: string;
  isConfirming: boolean;
  onPatch: (updater: (columns: ColumnRow[]) => ColumnRow[]) => void;
  onConfirm: () => void;
}

const ColumnConfirmationCard: React.FC<ColumnConfirmationCardProps> = ({
  columns,
  paperScopeSummary,
  isConfirming,
  onPatch,
  onConfirm,
}) => {
  const visibleCount = columns.filter((c) => c.isVisible).length;
  const canConfirm = visibleCount > 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <h3 className="font-sans text-base font-semibold tracking-tight text-foreground">
          Extraction columns
        </h3>
        <p className="font-sans text-sm leading-relaxed text-muted-foreground">
          Check the fields to include, rename as needed, then continue.
        </p>
        {paperScopeSummary ? (
          <p className="font-sans text-sm leading-relaxed text-muted-foreground">
            Papers: {paperScopeSummary}
          </p>
        ) : null}
      </CardHeader>

      <CardContent>
        <ul className="divide-y divide-border font-sans">
          {columns.map((col, idx) => (
            <li key={col.id}>
              <div className="flex items-start gap-3 py-3">
                <Checkbox
                  checked={col.isVisible}
                  onCheckedChange={(checked) =>
                    onPatch((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, isVisible: checked === true } : c))
                    )
                  }
                  className="mt-2.5"
                  aria-label={`Include ${col.name}`}
                />

                <div className="min-w-0 flex-1">
                  <Input
                    type="text"
                    value={col.name}
                    disabled={!col.isVisible}
                    onChange={(e) =>
                      onPatch((prev) =>
                        prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                      )
                    }
                    aria-label={`Column name ${idx + 1}`}
                  />
                  {col.isVisible && col.instructions?.trim() ? (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {col.instructions}
                    </p>
                  ) : null}
                </div>

                <ControlTooltip label="Remove column">
                  <Button
                    variant="ghost-destructive"
                    size="icon-sm"
                    onClick={() => onPatch((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label={`Remove ${col.name}`}
                    className="mt-0.5"
                  >
                    <X aria-hidden strokeWidth={2.25} />
                  </Button>
                </ControlTooltip>
              </div>
            </li>
          ))}
        </ul>

        <div className="pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onPatch((prev) => [
                ...prev,
                {
                  id: `custom-${crypto.randomUUID()}`,
                  name: "New column",
                  instructions: "",
                  isVisible: true,
                },
              ])
            }
          >
            <Plus aria-hidden strokeWidth={2} />
            Add column
          </Button>
        </div>
      </CardContent>

      <CardFooter>
        <div className="flex w-full flex-col gap-3 font-sans sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{visibleCount}</span>
            {" of "}
            <span className="tabular-nums">{columns.length}</span> selected
          </p>
          <Button
            onClick={onConfirm}
            disabled={!canConfirm || isConfirming}
            className="w-full sm:w-auto"
          >
            {isConfirming ? (
              <>
                <Spinner aria-hidden />
                Continuing…
              </>
            ) : (
              <>
                <Check aria-hidden strokeWidth={2.5} />
                Continue
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};
