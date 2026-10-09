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
import type {
  LiteratureScreeningDecision,
  ScreeningCriterion,
  ScreeningCriterionCheck,
  ScreeningCriterionStatus,
} from "../types/literatureScreening";
import { formatAuthorsLine } from "../types/rankedPaper";

interface LiteratureScreeningPanelProps {
  sessionId: Id<"literatureReviewSessions">;
  onClose: () => void;
}

const SCREENING_GRID_STYLE = {
  "--screening-cols": "minmax(300px, 0.95fr) minmax(420px, 1fr)",
} as React.CSSProperties;

/** Screen-reader prefix for a criterion's icon. */
const CRITERION_STATUS_LABEL: Record<ScreeningCriterionStatus, string> = {
  met: "Met: ",
  unclear: "Partly met or unclear: ",
  not_met: "Not met: ",
};

/** Plain-text status for the CSV export. */
const CRITERION_STATUS_TEXT: Record<ScreeningCriterionStatus, string> = {
  met: "met",
  unclear: "unclear",
  not_met: "not met",
};

const NO_CRITERIA: ScreeningCriterionCheck[] = [];

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

  const eligibilityCriteria: ScreeningCriterion[] =
    session?.workflowProvenance?.screeningCriteria ?? [];

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
          <>
            {eligibilityCriteria.length > 0 ? (
              <EligibilityCriteriaSummary criteria={eligibilityCriteria} />
            ) : null}
            <ScreeningDecisionGrid
              decisions={sortedDecisions}
              expandedDecisionKeys={expandedDecisionKeys}
              onToggleExpanded={toggleDecisionExpanded}
            />
          </>
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

/** The criteria every paper below was checked against, derived from the research question. */
function EligibilityCriteriaSummary({ criteria }: { criteria: ScreeningCriterion[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="border-b border-border/50 px-4 py-3">
      <h3 id={headingId} className="font-sans text-xs font-medium text-muted-foreground">
        Eligibility criteria
      </h3>
      <ol aria-label="Eligibility criteria" className="mt-2 space-y-1.5 text-xs leading-relaxed">
        {criteria.map((criterion, index) => (
          <li key={criterion.label} className="flex gap-2">
            <span className="shrink-0 font-sans tabular-nums text-muted-foreground">
              {index + 1}.
            </span>
            <p className="min-w-0">
              <span className="font-medium text-foreground">{criterion.label}</span>
              <span className="sr-only">: </span>
              <span className="block text-muted-foreground">{criterion.description}</span>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ScreeningDecisionGrid({
  decisions,
  expandedDecisionKeys,
  onToggleExpanded,
}: {
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
  decision,
  isExpanded,
  onToggleExpanded,
}: {
  decision: LiteratureScreeningDecision;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  return (
    <li className="grid border-b border-border/50 transition-colors hover:bg-muted/10 @3xl/screening:grid-cols-(--screening-cols)">
      <PaperSummaryCell decision={decision} />
      <ScreeningResultCell
        criteria={decision.criteria ?? NO_CRITERIA}
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
  criteria: ScreeningCriterionCheck[];
  decision: LiteratureScreeningDecision;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  const isIncluded = decision.decision === "included";
  const criteriaId = useId();
  const hasCriteria = criteria.length > 0;

  return (
    // Stacked under the paper, indent past its rank badge so the result lines up with the title.
    <div className="py-4 pr-4 pl-13 @3xl/screening:pl-4">
      <p className="text-xs leading-relaxed text-foreground">{decision.reason}</p>
      {hasCriteria ? (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
          {criteria.map((criterion) => (
            <CriterionChip key={criterion.label} criterion={criterion} />
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-3">
        <DecisionBadge included={isIncluded} />
        {hasCriteria ? (
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
        ) : null}
      </div>
      {hasCriteria && isExpanded ? (
        <div id={criteriaId} className="mt-4 space-y-2.5">
          {criteria.map((criterion) => (
            <CriterionDetail key={criterion.label} criterion={criterion} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CriterionChip({ criterion }: { criterion: ScreeningCriterionCheck }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-xs leading-none text-muted-foreground">
      <CriterionIcon status={criterion.status} />
      <span className="sr-only">{CRITERION_STATUS_LABEL[criterion.status]}</span>
      {criterion.label}
    </span>
  );
}

function CriterionDetail({ criterion }: { criterion: ScreeningCriterionCheck }) {
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

function CriterionIcon({ status }: { status: ScreeningCriterionStatus }) {
  if (status === "met") return <Check className="size-3.5 text-success" aria-hidden />;
  if (status === "unclear") return <Minus className="size-3.5 text-warning" aria-hidden />;
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

function formatCriteriaForExport(criteria: ScreeningCriterionCheck[] | undefined): string {
  return (criteria ?? [])
    .map((c) => `${c.label}: ${CRITERION_STATUS_TEXT[c.status]} (${c.explanation})`)
    .join("; ");
}

function exportScreeningDecisions(decisions: LiteratureScreeningDecision[], title: string) {
  if (decisions.length === 0) return;
  const headers = ["Rank", "Title", "Authors", "Year", "Decision", "Reason", "Criteria"];
  const rows = decisions.map((decision) => [
    String(decision.rank ?? decision.paperIndex + 1),
    decision.title,
    formatAuthorsLine(decision.authors),
    decision.year != null ? String(decision.year) : "",
    decision.decision,
    decision.reason,
    formatCriteriaForExport(decision.criteria),
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
