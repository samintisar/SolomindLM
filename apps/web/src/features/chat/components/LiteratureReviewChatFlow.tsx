import { ArrowRight, FileSpreadsheet, FileText, X } from "lucide-react";
import React from "react";
import { buildLiteratureReportChatPreview } from "../utils/literatureReportPreview";
import { LiteratureReviewSteps } from "./LiteratureReviewSteps";
import type { ResearchStep } from "./researchStepTypes";

interface TableColumn {
  id: string;
  name: string;
  isVisible: boolean;
}

interface TablePaper {
  citationId: string;
  rowData: Record<string, string>;
  isIncluded: boolean;
}

interface LiteratureTable {
  title: string;
  columns: TableColumn[];
  papers: TablePaper[];
}

interface ReportSection {
  heading: string;
  content: string;
}

interface LiteratureReport {
  title: string;
  content: string;
  sections: ReportSection[];
}

interface LiteratureReviewChatFlowProps {
  query: string;
  steps: ResearchStep[];
  sessionStatus: string | null;
  table?: LiteratureTable | null;
  report?: LiteratureReport | null;
  onOpenTable?: () => void;
  onOpenReport?: () => void;
  onDismiss?: () => void;
}

export const LiteratureReviewChatFlow: React.FC<LiteratureReviewChatFlowProps> = ({
  query,
  steps,
  sessionStatus,
  table,
  report,
  onOpenTable,
  onOpenReport,
  onDismiss,
}) => {
  const isComplete = sessionStatus === "completed";
  const isFailed = sessionStatus === "failed";
  const reportPreview = report ? buildLiteratureReportChatPreview(report) : null;

  return (
    <div className="flex min-h-full w-full flex-col px-3 py-4 sm:px-4 md:px-6 overflow-y-auto chat-panel-graph-grid">
      {/* User message */}
      <div className="flex justify-end mb-8">
        <div className="max-w-2xl rounded-2xl bg-[color-mix(in_oklch,var(--primary)_10%,var(--background))] px-5 py-3.5 text-base leading-relaxed text-foreground">
          {query}
        </div>
      </div>

      {/* Assistant content */}
      <div className="flex justify-start mb-2">
        <div className="w-full max-w-3xl">
          {/* Research steps */}
          <LiteratureReviewSteps steps={steps} />

          {/* Result cards when complete */}
          {isComplete && (table || report) && (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
              {table && (
                <ResultCard
                  icon={<FileSpreadsheet className="h-6 w-6 shrink-0 text-primary" />}
                  title={table.title}
                  meta={`${table.papers.length} papers · ${table.columns.filter((c) => c.isVisible).length} columns`}
                  typeLabel="Table"
                  onClick={onOpenTable}
                />
              )}
              {report && (
                <ResultCard
                  icon={<FileText className="h-6 w-6 shrink-0 text-primary" />}
                  title={report.title}
                  meta={`${report.sections.length} sections`}
                  typeLabel="Document"
                  onClick={onOpenReport}
                />
              )}
            </div>
          )}

          {/* Summary message when complete */}
          {isComplete && table && (
            <div className="mt-8 text-base leading-relaxed text-foreground">
              <p>
                I've created your literature review table with{" "}
                <strong>{table.papers.length} papers</strong> and{" "}
                <strong>{table.columns.filter((c) => c.isVisible).length} columns</strong>
                {report
                  ? ". Now I'll generate a comprehensive report summarizing the key findings across all papers..."
                  : ". You can open the table above to review and edit the extracted data."}
              </p>
              {reportPreview && (
                <p className="mt-4 text-[15px] leading-relaxed text-foreground">{reportPreview}</p>
              )}
            </div>
          )}

          {/* Dismiss button when complete */}
          {isComplete && onDismiss && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onDismiss}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Dismiss
              </button>
            </div>
          )}

          {/* Failed state */}
          {isFailed && (
            <div className="mt-5 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <div className="text-sm font-medium text-destructive">Literature Review Failed</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Something went wrong during the research process.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Result Card ────────────────────────────────────────────────────────────

interface ResultCardProps {
  icon: React.ReactNode;
  title: string;
  meta: string;
  typeLabel: string;
  onClick?: () => void;
}

const ResultCard: React.FC<ResultCardProps> = ({ icon, title, meta, typeLabel, onClick }) => {
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
        <div className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
          {title}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{typeLabel}</div>
        <div className="mt-1 text-xs text-muted-foreground/80">{meta}</div>
      </div>
      <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
};
