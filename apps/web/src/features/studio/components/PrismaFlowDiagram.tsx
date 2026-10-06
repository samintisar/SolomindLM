import React from "react";

export interface PrismaFlowCounts {
  recordsIdentified?: number;
  recordsAfterDedupe?: number;
  recordsScreened?: number;
  recordsExcluded?: number;
  /** Search papers included after screening; notebook papers are counted separately. */
  recordsIncluded?: number;
  /** The user's selected notebook papers, included without screening (#301). */
  recordsFromNotebook?: number;
  /** "Only your papers": no database search ran. */
  searchSkipped?: boolean;
}

/** Whether a run has counts to draw: a database search, or a papers-only review. */
export function hasPrismaCounts(counts: PrismaFlowCounts): boolean {
  if (counts.searchSkipped) return counts.recordsFromNotebook != null;
  return (
    counts.recordsIdentified != null ||
    counts.recordsAfterDedupe != null ||
    counts.recordsScreened != null
  );
}

interface PrismaFlowDiagramProps {
  counts: PrismaFlowCounts;
  className?: string;
}

/**
 * Lightweight PRISMA-style flow diagram for literature review sessions.
 */
export const PrismaFlowDiagram: React.FC<PrismaFlowDiagramProps> = ({ counts, className = "" }) => {
  const identified = counts.recordsIdentified ?? counts.recordsAfterDedupe;
  const deduped = counts.recordsAfterDedupe ?? identified;
  const screened = counts.recordsScreened ?? deduped;
  const excluded = counts.recordsExcluded ?? 0;
  const fromNotebook = counts.recordsFromNotebook ?? 0;
  const includedFromSearch = counts.searchSkipped ? 0 : (counts.recordsIncluded ?? 0);
  const included = includedFromSearch + fromNotebook;

  if (!hasPrismaCounts(counts)) {
    return null;
  }

  if (counts.searchSkipped) {
    return (
      <div className={`rounded-lg border border-border bg-muted/30 p-4 text-sm ${className}`}>
        <p className="mb-1 font-semibold text-foreground">PRISMA flow</p>
        <p className="mb-3 text-xs text-muted-foreground">No database search</p>
        <div className="flex flex-col items-center gap-2">
          <FlowBox label="From your notebook" value={fromNotebook} variant="blue" />
          <Arrow />
          <FlowBox label="Studies included" value={included} variant="green" />
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border bg-muted/30 p-4 text-sm ${className}`}>
      <p className="mb-3 font-semibold text-foreground">PRISMA flow</p>
      <div className="flex flex-col items-center gap-2">
        <FlowBox label="Records identified" value={identified} variant="blue" />
        <Arrow />
        <FlowBox label="After deduplication" value={deduped} variant="blue" />
        <Arrow />
        <div className="flex w-full max-w-md flex-wrap items-start justify-center gap-4">
          <FlowBox label="Records screened" value={screened} variant="purple" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-muted-foreground">Excluded</span>
            <FlowBox label="" value={excluded} variant="red" compact />
          </div>
        </div>
        <Arrow />
        {fromNotebook > 0 ? (
          <>
            <div className="flex w-full max-w-md flex-wrap items-start justify-center gap-4">
              <FlowBox label="Included from search" value={includedFromSearch} variant="purple" />
              <FlowBox label="From your notebook" value={fromNotebook} variant="blue" />
            </div>
            <Arrow />
          </>
        ) : null}
        <FlowBox label="Studies included" value={included} variant="green" />
      </div>
    </div>
  );
};

function Arrow() {
  return <div className="h-4 w-px bg-border" aria-hidden />;
}

function FlowBox({
  label,
  value,
  variant,
  compact,
}: {
  label: string;
  value?: number;
  variant: "blue" | "purple" | "red" | "green";
  compact?: boolean;
}) {
  const colors = {
    blue: "border-blue-500/40 bg-blue-500/10",
    purple: "border-violet-500/40 bg-violet-500/10",
    red: "border-red-500/40 bg-red-500/10",
    green: "border-green-600/40 bg-green-600/10",
  }[variant];

  return (
    <div
      className={`rounded-md border px-4 text-center ${compact ? "min-w-[4rem] py-1.5" : "min-w-[10rem] py-2"} ${colors}`}
    >
      {label ? <div className="text-xs text-muted-foreground">{label}</div> : null}
      <div className="text-base font-semibold tabular-nums text-foreground">
        {value != null ? value.toLocaleString() : "—"}
      </div>
    </div>
  );
}
