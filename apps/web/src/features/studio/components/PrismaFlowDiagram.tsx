import React from "react";
import { cn } from "@/shared/utils/cn";

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
export const PrismaFlowDiagram: React.FC<PrismaFlowDiagramProps> = ({ counts, className }) => {
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
      <div className={cn("rounded-xl bg-muted/40 p-4 text-sm", className)}>
        <p className="mb-1 font-sans font-semibold">PRISMA flow</p>
        <p className="mb-3 font-sans text-xs text-muted-foreground">No database search</p>
        <div className="flex flex-col items-center gap-2">
          <FlowBox label="From your notebook" value={fromNotebook} variant="source" />
          <Arrow />
          <FlowBox label="Studies included" value={included} variant="included" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl bg-muted/40 p-4 text-sm", className)}>
      <p className="mb-3 font-sans font-semibold">PRISMA flow</p>
      <div className="flex flex-col items-center gap-2">
        <FlowBox label="Records identified" value={identified} variant="source" />
        <Arrow />
        <FlowBox label="After deduplication" value={deduped} variant="source" />
        <Arrow />
        <div className="flex w-full max-w-md flex-wrap items-start justify-center gap-4">
          <FlowBox label="Records screened" value={screened} variant="screen" />
          <div className="flex flex-col items-center gap-1">
            <span className="font-sans text-xs text-muted-foreground">Excluded</span>
            <FlowBox label="" value={excluded} variant="excluded" compact />
          </div>
        </div>
        <Arrow />
        {fromNotebook > 0 ? (
          <>
            <div className="flex w-full max-w-md flex-wrap items-start justify-center gap-4">
              <FlowBox label="Included from search" value={includedFromSearch} variant="screen" />
              <FlowBox label="From your notebook" value={fromNotebook} variant="source" />
            </div>
            <Arrow />
          </>
        ) : null}
        <FlowBox label="Studies included" value={included} variant="included" />
      </div>
    </div>
  );
};

function Arrow() {
  return <div className="h-4 w-px bg-border" aria-hidden />;
}

type FlowVariant = "source" | "screen" | "excluded" | "included";

const FLOW_BOX_CLASS: Record<FlowVariant, string> = {
  source: "bg-info-muted ring-1 ring-info-border",
  screen: "bg-muted ring-1 ring-hairline",
  excluded: "bg-destructive-muted ring-1 ring-destructive-border",
  included: "bg-success-muted ring-1 ring-success-border",
};

function FlowBox({
  label,
  value,
  variant,
  compact,
}: {
  label: string;
  value?: number;
  variant: FlowVariant;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-4 text-center",
        compact ? "min-w-16 py-1.5" : "min-w-40 py-2",
        FLOW_BOX_CLASS[variant]
      )}
    >
      {label ? <div className="font-sans text-xs text-muted-foreground">{label}</div> : null}
      <div className="font-sans text-base font-semibold tabular-nums">
        {value != null ? value.toLocaleString() : "—"}
      </div>
    </div>
  );
}
