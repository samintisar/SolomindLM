import React from "react";

export interface PrismaFlowCounts {
  recordsIdentified?: number;
  recordsAfterDedupe?: number;
  recordsScreened?: number;
  recordsExcluded?: number;
  recordsIncluded?: number;
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
  const included = counts.recordsIncluded ?? 0;

  if (identified == null && deduped == null && screened == null) {
    return null;
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
