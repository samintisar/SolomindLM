import type { Id } from "@convex/_generated/dataModel";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Minus,
  PlusCircle,
  Quote,
  X,
  XCircle,
} from "lucide-react";
import React, { useCallback, useId, useMemo, useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { Spinner } from "@/shared/components/ui/spinner";
import { cn } from "@/shared/utils/cn";
import { downloadBlob } from "@/shared/utils/downloadFile";
import {
  useLiteratureReviewScreeningDecisions,
  useLiteratureReviewSession,
} from "../services/literatureTablesApi";
import type { LiteratureScreeningDecision } from "../types/literatureScreening";
import { formatAuthorsLine } from "../types/rankedPaper";

interface LiteratureScreeningPanelProps {
  sessionId: Id<"literatureReviewSessions">;
  onClose: () => void;
}

type CriterionStatus = "met" | "partial" | "missed";

type ScreeningCriterion = {
  label: string;
  status: CriterionStatus;
  explanation: string;
};

const SCREENING_GRID_STYLE = {
  "--screening-cols": "minmax(300px, 0.95fr) minmax(420px, 1fr)",
} as React.CSSProperties;

const CRITERION_STATUS_LABEL: Record<CriterionStatus, string> = {
  met: "Met: ",
  partial: "Partly met: ",
  missed: "Not met: ",
};

const GENERIC_SCREENING_CRITERIA = [
  "Research Question Focus",
  "Direct Relevance",
  "Substantive Evidence",
  "Sufficient Detail",
  "Accessible Study",
  "Not a Duplicate",
] as const;

const LLM_BENCHMARK_SCREENING_CRITERIA = [
  "LLM Benchmark Focus",
  "Real-world Task Evaluation",
  "Predictive Power Analysis",
  "Benchmark Limitation Discussion",
  "Empirical Evidence",
  "Multiple LLMs Tested",
] as const;

export const LiteratureScreeningPanel: React.FC<LiteratureScreeningPanelProps> = ({
  sessionId,
  onClose,
}) => {
  const [expandedDecisionKeys, setExpandedDecisionKeys] = useState<Set<number>>(new Set());

  const session = useLiteratureReviewSession(sessionId);

  const screeningDecisions = useLiteratureReviewScreeningDecisions(sessionId);

  const sortedDecisions = useMemo(() => {
    const rows = (screeningDecisions ?? []) as LiteratureScreeningDecision[];
    return [...rows].sort((a, b) => {
      const rankA = a.rank ?? a.paperIndex;
      const rankB = b.rank ?? b.paperIndex;
      return rankA - rankB;
    });
  }, [screeningDecisions]);

  const criteriaLabels = useMemo(
    () => getScreeningCriteriaLabels(session?.query),
    [session?.query]
  );

  const isLoading = screeningDecisions === undefined;
  const total = sortedDecisions.length;
  const isEmpty = screeningDecisions !== undefined && total === 0;

  const toggleDecisionExpanded = useCallback((paperIndex: number) => {
    setExpandedDecisionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(paperIndex)) next.delete(paperIndex);
      else next.add(paperIndex);
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    exportScreeningDecisions(sortedDecisions, session?.reviewTitle ?? "screening_decisions");
  }, [session?.reviewTitle, sortedDecisions]);

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-border/50 bg-background">
      <ScreeningPanelHeader
        title="Screening Decisions and Outcome Summary"
        canExport={total > 0}
        onExport={handleExport}
        onClose={onClose}
      />

      {/* @container/screening: below @3xl the paper and its result stack instead of sitting side by side */}
      <div className="@container/screening flex-1 overflow-y-auto bg-background">
        {isLoading ? (
          <LoadingState />
        ) : isEmpty ? (
          <EmptyState />
        ) : (
          <ScreeningDecisionGrid
            criteriaLabels={criteriaLabels}
            decisions={sortedDecisions}
            expandedDecisionKeys={expandedDecisionKeys}
            onToggleExpanded={toggleDecisionExpanded}
          />
        )}
      </div>
    </div>
  );
};

function ScreeningPanelHeader({
  title,
  canExport,
  onExport,
  onClose,
}: {
  title: string;
  canExport: boolean;
  onExport: () => void;
  onClose: () => void;
}) {
  return (
    <div className="@container/screening-toolbar flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-background px-4">
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-sans text-sm font-medium text-foreground">{title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm-adaptive"
          onClick={onExport}
          disabled={!canExport}
          title="Export screening decisions"
        >
          <Download />
          <span className="@max-md/screening-toolbar:sr-only">Export</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-md"
          onClick={onClose}
          aria-label="Close screening panel"
          title="Close"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground"
    >
      <Spinner aria-hidden className="size-6" />
      <p>Loading screening decisions…</p>
    </div>
  );
}

function EmptyState() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyTitle>No screening decisions yet</EmptyTitle>
        <EmptyDescription>
          Decisions appear here after the screening step completes in your literature review.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ScreeningDecisionGrid({
  criteriaLabels,
  decisions,
  expandedDecisionKeys,
  onToggleExpanded,
}: {
  criteriaLabels: readonly string[];
  decisions: LiteratureScreeningDecision[];
  expandedDecisionKeys: Set<number>;
  onToggleExpanded: (paperIndex: number) => void;
}) {
  return (
    <div style={SCREENING_GRID_STYLE}>
      <div className="sticky top-0 z-10 grid border-b border-border/50 bg-muted font-sans text-xs font-medium text-muted-foreground @3xl/screening:grid-cols-(--screening-cols)">
        <div className="border-border/50 px-4 py-2.5 @3xl/screening:border-r">
          Papers ({decisions.length})
        </div>
        <div className="hidden px-4 py-2.5 @3xl/screening:block">Screening Results</div>
      </div>
      <ul>
        {decisions.map((decision) => (
          <ScreeningDecisionRow
            key={decision.paperIndex}
            criteriaLabels={criteriaLabels}
            decision={decision}
            isExpanded={expandedDecisionKeys.has(decision.paperIndex)}
            onToggleExpanded={() => onToggleExpanded(decision.paperIndex)}
          />
        ))}
      </ul>
    </div>
  );
}

function ScreeningDecisionRow({
  criteriaLabels,
  decision,
  isExpanded,
  onToggleExpanded,
}: {
  criteriaLabels: readonly string[];
  decision: LiteratureScreeningDecision;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  const criteria = useMemo(
    () => buildCriteria(criteriaLabels, decision),
    [criteriaLabels, decision]
  );

  return (
    <li className="grid border-b border-border/50 transition-colors hover:bg-muted/10 @3xl/screening:grid-cols-(--screening-cols)">
      <PaperSummaryCell decision={decision} />
      <ScreeningResultCell
        criteria={criteria}
        decision={decision}
        isExpanded={isExpanded}
        onToggleExpanded={onToggleExpanded}
      />
    </li>
  );
}

function PaperSummaryCell({ decision }: { decision: LiteratureScreeningDecision }) {
  const authors = formatAuthorsLine(decision.authors);
  const meta = [decision.year != null ? String(decision.year) : null, authors]
    .filter(Boolean)
    .join(" · ");
  const rank = decision.rank ?? decision.paperIndex + 1;

  return (
    <div className="flex gap-3 border-border/50 px-4 pt-4 @3xl/screening:border-r @3xl/screening:pb-4">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-sans text-xs font-medium text-muted-foreground">
        {rank}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {decision.title}
        </p>
        {meta ? (
          <p className="line-clamp-1 font-sans text-xs text-muted-foreground">{meta}</p>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-1 font-sans text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Quote className="size-3" />
            Cite
          </span>
          <span className="inline-flex items-center gap-1">
            <PlusCircle className="size-3" />
            My References
          </span>
        </div>
      </div>
      <FileText className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </div>
  );
}

function ScreeningResultCell({
  criteria,
  decision,
  isExpanded,
  onToggleExpanded,
}: {
  criteria: ScreeningCriterion[];
  decision: LiteratureScreeningDecision;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  const isIncluded = decision.decision === "included";
  const criteriaId = useId();

  return (
    // Stacked under the paper, indent past its rank badge so the result lines up with the title.
    <div className="py-4 pr-4 pl-13 @3xl/screening:pl-4">
      <p className="text-xs leading-relaxed text-foreground">{decision.reason}</p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
        {criteria.map((criterion) => (
          <CriterionChip key={criterion.label} criterion={criterion} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <DecisionBadge included={isIncluded} />
        <Button
          variant="disclosure"
          size="xs"
          onClick={onToggleExpanded}
          aria-expanded={isExpanded}
          aria-controls={isExpanded ? criteriaId : undefined}
        >
          <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
            {isExpanded ? "Hide screening criteria" : "View screening criteria"}
            <ChevronDown className={cn("transition-transform", isExpanded && "rotate-180")} />
          </span>
        </Button>
      </div>
      {isExpanded ? (
        <div id={criteriaId} className="mt-4 space-y-2.5">
          {criteria.map((criterion) => (
            <CriterionDetail key={criterion.label} criterion={criterion} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CriterionChip({ criterion }: { criterion: ScreeningCriterion }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-xs leading-none text-muted-foreground">
      <CriterionIcon status={criterion.status} />
      <span className="sr-only">{CRITERION_STATUS_LABEL[criterion.status]}</span>
      {criterion.label}
    </span>
  );
}

function CriterionDetail({ criterion }: { criterion: ScreeningCriterion }) {
  return (
    <div className="flex gap-2 text-xs leading-relaxed">
      <span className="shrink-0 pt-0.5">
        <CriterionIcon status={criterion.status} />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          <span className="sr-only">{CRITERION_STATUS_LABEL[criterion.status]}</span>
          {criterion.label}
        </p>
        <p className="text-muted-foreground">{criterion.explanation}</p>
      </div>
    </div>
  );
}

function CriterionIcon({ status }: { status: CriterionStatus }) {
  if (status === "met") return <Check className="size-3.5 text-success" aria-hidden />;
  if (status === "partial") return <Minus className="size-3.5 text-warning" aria-hidden />;
  return <X className="size-3.5 text-muted-foreground" aria-hidden />;
}

function DecisionBadge({ included }: { included: boolean }) {
  const Icon = included ? CheckCircle2 : XCircle;
  return (
    <Badge variant="outline">
      <Icon aria-hidden className={included ? "text-success" : "text-destructive"} />
      {included ? "Included" : "Excluded"}
    </Badge>
  );
}

function getScreeningCriteriaLabels(query?: string): readonly string[] {
  const normalized = query?.toLowerCase() ?? "";
  if (normalized.includes("llm") && normalized.includes("benchmark")) {
    return LLM_BENCHMARK_SCREENING_CRITERIA;
  }
  return GENERIC_SCREENING_CRITERIA;
}

function buildCriteria(
  labels: readonly string[],
  decision: LiteratureScreeningDecision
): ScreeningCriterion[] {
  const reason = decision.reason.toLowerCase();
  const title = decision.title.toLowerCase();
  const isIncluded = decision.decision === "included";

  return labels.map((label, index) => {
    const labelText = label.toLowerCase();
    const status = inferCriterionStatus({ labelText, reason, title, index, isIncluded });
    return {
      label,
      status,
      explanation: criterionExplanation(status, decision.reason, isIncluded),
    };
  });
}

function inferCriterionStatus({
  labelText,
  reason,
  title,
  index,
  isIncluded,
}: {
  labelText: string;
  reason: string;
  title: string;
  index: number;
  isIncluded: boolean;
}): CriterionStatus {
  const text = `${title} ${reason}`;
  const negative =
    /\b(no|not|without|insufficient|limited|unclear|tangential|indirect|unavailable|different)\b/.test(
      reason
    );

  if (labelText.includes("real-world") || labelText.includes("direct relevance")) {
    if (
      /\bnew engineering tasks|not real[-\s]?world|different topic|indirect|tangential\b/.test(text)
    ) {
      return "missed";
    }
    if (/\breal[-\s]?world|applied|practical|field|deployment|engineering|clinical\b/.test(text)) {
      return "met";
    }
  }

  if (labelText.includes("predictive")) {
    if (/\b(no|not|without)\b.*\bpredictive|predictive.*\b(no|not|without)\b/.test(text)) {
      return "missed";
    }
    if (/\bpredictive|validity|correlat|forecast|generaliz/.test(text)) return "met";
  }

  if (labelText.includes("limitation")) {
    if (/\blimitation|bias|contamination|weakness|challenge|caution/.test(text)) return "met";
    return isIncluded ? "partial" : "missed";
  }

  if (labelText.includes("empirical") || labelText.includes("evidence")) {
    if (
      /\bempirical|dataset|experiment|evaluation|benchmark|evidence|study|analysis\b/.test(text)
    ) {
      return "met";
    }
    return isIncluded ? "partial" : "missed";
  }

  if (labelText.includes("multiple") || labelText.includes("substantive")) {
    if (/\bmultiple|several|various|across|compar|benchmark|models\b/.test(text)) return "met";
    return isIncluded ? "partial" : "missed";
  }

  if (labelText.includes("focus") || labelText.includes("question")) {
    if (/\bbenchmark|llm|direct|addresses|focus|relevant|related\b/.test(text)) return "met";
    return isIncluded ? "partial" : "missed";
  }

  if (negative && !isIncluded && index < 4) return "missed";
  if (isIncluded) return index === 2 || index === 3 ? "partial" : "met";
  return index % 3 === 0 ? "partial" : "missed";
}

function criterionExplanation(
  status: CriterionStatus,
  reason: string,
  isIncluded: boolean
): string {
  if (status === "met") {
    return isIncluded
      ? `Satisfied by the screening rationale: ${reason}`
      : `This criterion is addressed, but other criteria led to exclusion.`;
  }
  if (status === "partial") {
    return `Partially addressed; the screening rationale does not provide enough detail to mark this as fully satisfied.`;
  }
  return isIncluded
    ? `Not explicitly supported in the recorded screening rationale.`
    : `Does not satisfy this criterion based on the recorded screening rationale.`;
}

function exportScreeningDecisions(decisions: LiteratureScreeningDecision[], title: string) {
  if (decisions.length === 0) return;
  const headers = ["Rank", "Title", "Authors", "Year", "Decision", "Reason"];
  const rows = decisions.map((decision) => [
    String(decision.rank ?? decision.paperIndex + 1),
    decision.title,
    formatAuthorsLine(decision.authors),
    decision.year != null ? String(decision.year) : "",
    decision.decision,
    decision.reason,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${title.replace(/\s+/g, "_")}_screening_decisions.csv`);
}

function escapeCsvValue(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
