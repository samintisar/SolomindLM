import type { Id } from "@convex/_generated/dataModel";
import { ArrowRight, Check, FileSpreadsheet, FileText, Loader2, Plus, X } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
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
import { LiteratureReviewSteps } from "./LiteratureReviewSteps";
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
    } catch {
      // error handled by caller
    } finally {
      setIsConfirmingColumns(false);
    }
  }, [confirmColumnsMutation, sessionId, suggestedColumns]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      await retryMutation({ sessionId: sessionId! });
    } finally {
      setIsRetrying(false);
    }
  }, [retryMutation, sessionId]);

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

  const includedPaperCount =
    table?.papers.filter((p: { isIncluded: boolean }) => p.isIncluded).length ??
    table?.papers.length ??
    0;
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
              icon={<FileSpreadsheet className="h-6 w-6 shrink-0 text-primary" />}
              title={table?.title ?? "Literature Table"}
              typeLabel="Table"
              onClick={() => onOpenTable?.(tableIdResolved)}
            />
          )}
          {reportIdResolved && notebookId && (
            <ResultCard
              icon={<FileText className="h-6 w-6 shrink-0 text-primary" />}
              title={report?.title ?? "Literature Report"}
              typeLabel="Document"
              onClick={() => onOpenReport?.(reportIdResolved)}
            />
          )}
        </div>
      )}

      {/* Completion summary + report preview (below cards) */}
      {isComplete && table && (
        <div className="mt-8 text-base leading-relaxed text-foreground">
          <p>
            I&apos;ve created your literature review table with{" "}
            <strong>{includedPaperCount} papers</strong> and{" "}
            <strong>{visibleColumnCount} columns</strong>
            {report
              ? ". Now I'll generate a comprehensive report summarizing the key findings across all papers..."
              : ". Open the table above to review and edit the extracted data."}
          </p>
          {reportPreview && (
            <p className="mt-4 text-[15px] leading-relaxed text-foreground">{reportPreview}</p>
          )}
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          <div className="text-sm font-medium text-destructive">Literature Review Failed</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {error || "Something went wrong during the research process."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isRetrying ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Retrying...
                </span>
              ) : (
                "Retry from last step"
              )}
            </button>
          </div>
        </div>
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
  isConfirming: boolean;
  onPatch: (updater: (columns: ColumnRow[]) => ColumnRow[]) => void;
  onConfirm: () => void;
}

const ColumnConfirmationCard: React.FC<ColumnConfirmationCardProps> = ({
  columns,
  isConfirming,
  onPatch,
  onConfirm,
}) => {
  const visibleCount = columns.filter((c) => c.isVisible).length;
  const canConfirm = visibleCount > 0;

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card font-sans">
      <div className="border-b border-border px-4 py-3.5 sm:px-5">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
          Extraction columns
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Check the fields to include, rename as needed, then continue.
        </p>
      </div>

      <ul className="divide-y divide-border">
        {columns.map((col, idx) => (
          <li key={col.id} className={col.isVisible ? "bg-card" : "bg-muted"}>
            <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <input
                type="checkbox"
                checked={col.isVisible}
                onChange={(e) =>
                  onPatch((prev) =>
                    prev.map((c, i) => (i === idx ? { ...c, isVisible: e.target.checked } : c))
                  )
                }
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                aria-label={`Include ${col.name}`}
              />

              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={col.name}
                  disabled={!col.isVisible}
                  onChange={(e) =>
                    onPatch((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                    )
                  }
                  className={`w-full min-w-0 border-0 bg-transparent p-0 text-sm font-medium leading-snug focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm disabled:cursor-not-allowed ${
                    col.isVisible
                      ? "text-foreground"
                      : "text-muted-foreground line-through decoration-muted-foreground/50"
                  }`}
                  aria-label={`Column name ${idx + 1}`}
                />
                {col.isVisible && col.instructions?.trim() ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {col.instructions}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onPatch((prev) => prev.filter((_, i) => i !== idx))}
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title="Remove column"
                aria-label={`Remove ${col.name}`}
              >
                <X className="size-3.5" strokeWidth={2.25} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-border px-4 py-2 sm:px-5">
        <button
          type="button"
          onClick={() =>
            onPatch((prev) => [
              ...prev,
              {
                id: `custom-${Date.now()}`,
                name: "New column",
                instructions: "",
                isVisible: true,
              },
            ])
          }
          className="inline-flex items-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Plus className="size-4" strokeWidth={2} />
          Add column
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-muted px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{visibleCount}</span>
          {" of "}
          <span className="tabular-nums">{columns.length}</span> selected
        </p>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm || isConfirming}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
        >
          {isConfirming ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Continuing…
            </>
          ) : (
            <>
              <Check className="size-4" strokeWidth={2.5} />
              Continue
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// ── Result Card ────────────────────────────────────────────────────────────

interface ResultCardProps {
  icon: React.ReactNode;
  title: string;
  typeLabel: string;
  onClick?: () => void;
}

const ResultCard: React.FC<ResultCardProps> = ({ icon, title, typeLabel, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-sm transition-all hover:border-border hover:bg-accent/25"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[15px] font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
          {title}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{typeLabel}</div>
      </div>
      <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
};
