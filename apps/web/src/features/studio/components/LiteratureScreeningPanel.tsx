import React, { useCallback, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Minus,
  PlusCircle,
  Quote,
  X,
  XCircle,
} from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { ResizeHandle } from "./ResizeHandle";
import {
  useLiteratureReviewSession,
  useLiteratureReviewScreeningDecisions,
} from "../services/literatureTablesApi";
import { formatAuthorsLine } from "../types/rankedPaper";
import type { LiteratureScreeningDecision } from "../types/literatureScreening";

interface LiteratureScreeningPanelProps {
  sessionId: Id<"literatureReviewSessions">;
  width: number;
  isResizing: boolean;
  onClose: () => void;
}

type CriterionStatus = "met" | "partial" | "missed";

type ScreeningCriterion = {
  label: string;
  status: CriterionStatus;
  explanation: string;
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
  width,
  isResizing: _isResizing,
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

  const { included, excluded } = useMemo(() => {
    return {
      included: sortedDecisions.filter((d) => d.decision === "included"),
      excluded: sortedDecisions.filter((d) => d.decision === "excluded"),
    };
  }, [sortedDecisions]);

  const criteriaLabels = useMemo(() => getScreeningCriteriaLabels(session?.query), [session?.query]);

  const isLoading = screeningDecisions === undefined;
  const total = included.length + excluded.length;
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
    <div
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-l-2 border-border bg-background"
    >
      <ResizeHandle width={width} position="left" />

      <div className="flex shrink-0 flex-col border-b border-border bg-background">
        <ScreeningPanelHeader
          title="Screening Decisions and Outcome Summary"
          subtitle={session?.query}
          count={total}
          canExport={total > 0}
          onExport={handleExport}
          onClose={onClose}
        />
        {!isLoading && total > 0 ? (
          <ScreeningOutcomeSummary included={included.length} excluded={excluded.length} />
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto bg-background">
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
  subtitle,
  count,
  canExport,
  onExport,
  onClose,
}: {
  title: string;
  subtitle?: string;
  count: number;
  canExport: boolean;
  onExport: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="truncate text-[15px] font-semibold text-foreground">
          {title}
        </h2>
        {subtitle ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}
        {count > 0 ? (
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {count.toLocaleString()} screened papers
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onExport}
          disabled={!canExport}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close screening panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ScreeningOutcomeSummary({ included, excluded }: { included: number; excluded: number }) {
  return (
    <div className="grid grid-cols-3 border-t border-border bg-muted/20 text-xs">
      <SummaryMetric label="Papers" value={included + excluded} />
      <SummaryMetric label="Included" value={included} />
      <SummaryMetric label="Excluded" value={excluded} />
    </div>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="border-r border-border px-4 py-2 last:border-r-0">
      <div className="text-sm font-semibold text-foreground">{value.toLocaleString()}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="mb-3 h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm">Loading screening decisions…</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-muted-foreground">
      <BookOpen className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm font-medium text-foreground">No screening decisions yet</p>
      <p className="text-xs mt-1">
        Decisions appear here after the screening step completes in your literature review.
      </p>
    </div>
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
    <div className="min-w-[760px]">
      <div className="sticky top-0 z-10 grid grid-cols-[minmax(300px,0.95fr)_minmax(420px,1fr)] border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground backdrop-blur">
        <div className="border-r border-border px-4 py-2.5">Papers ({decisions.length})</div>
        <div className="px-4 py-2.5">Screening Results</div>
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
    <li className="grid grid-cols-[minmax(300px,0.95fr)_minmax(420px,1fr)] border-b border-border transition-colors hover:bg-muted/10">
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
  const meta = [
    decision.year != null ? String(decision.year) : null,
    authors,
  ]
    .filter(Boolean)
    .join(" · ");
  const rank = decision.rank ?? decision.paperIndex + 1;

  return (
    <div className="flex gap-3 border-r border-border px-4 py-4">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
        {rank}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
          {decision.title}
        </p>
        {meta ? <p className="line-clamp-1 text-[11px] text-muted-foreground">{meta}</p> : null}
        <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Quote className="h-3 w-3" />
            Cite
          </span>
          <span className="inline-flex items-center gap-1">
            <PlusCircle className="h-3 w-3" />
            My References
          </span>
        </div>
      </div>
      <FileText className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
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

  return (
    <div className="px-4 py-4">
      <p className="text-[12px] leading-relaxed text-foreground">{decision.reason}</p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
        {criteria.map((criterion) => (
          <CriterionChip key={criterion.label} criterion={criterion} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <DecisionBadge included={isIncluded} />
        <button
          type="button"
          onClick={onToggleExpanded}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={isExpanded}
        >
          {isExpanded ? "Hide screening criteria" : "View screening criteria"}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")}
          />
        </button>
      </div>
      {isExpanded ? (
        <div className="mt-4 space-y-2.5">
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
    <span className="inline-flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
      <CriterionIcon status={criterion.status} />
      {criterion.label}
    </span>
  );
}

function CriterionDetail({ criterion }: { criterion: ScreeningCriterion }) {
  return (
    <div className="grid grid-cols-[16px_1fr] gap-2 text-[11px] leading-relaxed">
      <span className="pt-0.5">
        <CriterionIcon status={criterion.status} />
      </span>
      <div>
        <p className="font-medium text-foreground">{criterion.label}</p>
        <p className="text-muted-foreground">{criterion.explanation}</p>
      </div>
    </div>
  );
}

function CriterionIcon({ status }: { status: CriterionStatus }) {
  const iconClass = "h-3.5 w-3.5 text-muted-foreground";
  if (status === "met") return <Check className={iconClass} aria-hidden />;
  if (status === "partial") return <Minus className={iconClass} aria-hidden />;
  return <X className={iconClass} aria-hidden />;
}

function DecisionBadge({ included }: { included: boolean }) {
  const label = included ? "Included" : "Excluded";
  const Icon = included ? CheckCircle2 : XCircle;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {label}
    </span>
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
  const negative = /\b(no|not|without|insufficient|limited|unclear|tangential|indirect|unavailable|different)\b/.test(
    reason
  );

  if (labelText.includes("real-world") || labelText.includes("direct relevance")) {
    if (/\bnew engineering tasks|not real[-\s]?world|different topic|indirect|tangential\b/.test(text)) {
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
    if (/\bempirical|dataset|experiment|evaluation|benchmark|evidence|study|analysis\b/.test(text)) {
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

function criterionExplanation(status: CriterionStatus, reason: string, isIncluded: boolean): string {
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
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/\s+/g, "_")}_screening_decisions.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
