import {
  normalizeLiteratureReportSectionContent,
  stripLeadingSectionHeadingLine,
} from "@convex/literatureReview/reportContext";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileDown,
  FileText,
  Loader2,
  Printer,
  Save,
  X,
} from "lucide-react";
import React, { lazy, Suspense, useMemo, useState } from "react";
import { DropdownMenu } from "@/shared/ui/DropdownMenu";
import { cn, sanitizeMarkdown } from "@/shared/utils";
import { CitationStyle, CitationStylePicker } from "../CitationStylePicker";
import { type PrismaFlowCounts, PrismaFlowDiagram } from "../PrismaFlowDiagram";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

// ── Types ────────────────────────────────────────────────────────────────

export interface ReportSection {
  heading: string;
  content: string;
}

export interface LiteratureReport {
  title: string;
  content: string;
  citationStyle: CitationStyle;
  sections: ReportSection[];
  citationIds: string[];
}

export interface LiteratureReportViewProps {
  report: LiteratureReport;
  /** Panel header when distinct from the document title (e.g. Deep Research vs Literature Report). */
  toolbarLabel?: string;
  onBack?: () => void;
  onExport?: () => void;
  onSaveAndEdit?: () => Promise<void>;
  citations?: Record<string, { title: string; authors: string[]; year?: number; url: string }>;
  workflowProvenance?: PrismaFlowCounts;
}

// ── Section Renderer ─────────────────────────────────────────────────────

interface SectionRendererProps {
  section: ReportSection;
  workflowProvenance?: PrismaFlowCounts;
}

function isReferencesSectionHeading(heading: string): boolean {
  return heading.trim().toLowerCase() === "references";
}

const SectionRenderer: React.FC<SectionRendererProps> = ({ section, workflowProvenance }) => {
  const isMethods = section.heading.trim().toLowerCase() === "methods";
  const showPrismaDiagram =
    isMethods &&
    workflowProvenance &&
    (workflowProvenance.recordsIdentified != null ||
      workflowProvenance.recordsAfterDedupe != null ||
      workflowProvenance.recordsScreened != null);

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-foreground mb-3 pb-2 border-b border-border">
        {section.heading}
      </h2>
      {showPrismaDiagram ? (
        <PrismaFlowDiagram counts={workflowProvenance} className="mb-6" />
      ) : null}
      <div className="prose prose-stone dark:prose-invert max-w-none font-serif leading-relaxed text-foreground">
        <Suspense fallback={<div className="animate-pulse h-4 bg-secondary/30 rounded w-full" />}>
          <MarkdownRenderer>
            {sanitizeMarkdown(
              normalizeLiteratureReportSectionContent(
                stripLeadingSectionHeadingLine(section.content, section.heading),
                section.heading
              )
            )}
          </MarkdownRenderer>
        </Suspense>
      </div>
    </section>
  );
};

// ── References Section ───────────────────────────────────────────────────

interface ReferencesSectionProps {
  citations: Record<string, { title: string; authors: string[]; year?: number; url: string }>;
  style: CitationStyle;
  onStyleChange: (style: CitationStyle) => void;
}

const ReferencesSection: React.FC<ReferencesSectionProps> = ({
  citations,
  style,
  onStyleChange,
}) => {
  const [didCopy, setDidCopy] = useState(false);

  const sortedCitations = useMemo(() => {
    return Object.entries(citations).sort(([, a], [, b]) => {
      const aLast = a.authors[0]?.split(" ").pop() || "";
      const bLast = b.authors[0]?.split(" ").pop() || "";
      return aLast.localeCompare(bLast);
    });
  }, [citations]);

  if (sortedCitations.length === 0) return null;

  const formattedReferences = sortedCitations.map(([, citation], index) =>
    formatReference(citation, style, index)
  );

  const handleCopyReferences = async () => {
    await navigator.clipboard.writeText(formattedReferences.join("\n\n"));
    setDidCopy(true);
    window.setTimeout(() => setDidCopy(false), 1600);
  };

  return (
    <section className="mt-12 pt-8 border-t-2 border-border">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">References</h2>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleCopyReferences}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title={didCopy ? "Copied citations" : "Copy all citations"}
            aria-label={didCopy ? "Copied citations" : "Copy all citations"}
          >
            {didCopy ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          <CitationStylePicker
            value={style}
            onChange={onStyleChange}
            className="w-35 @min-[720px]/report-toolbar:w-42"
          />
        </div>
      </div>
      <ul className="space-y-4">
        {sortedCitations.map(([key], index) => (
          <li key={key} className="pl-4 -indent-4 text-sm text-foreground leading-relaxed">
            {formattedReferences[index]}
          </li>
        ))}
      </ul>
    </section>
  );
};

// ── Main Component ───────────────────────────────────────────────────────

function formatReference(
  citation: { title: string; authors: string[]; year?: number; url: string },
  style: CitationStyle,
  index: number
): string {
  const authors = citation.authors.join(", ");
  const year = citation.year || "n.d.";

  switch (style) {
    case "apa7":
    case "apa6":
      return `${authors} (${year}). ${citation.title}. ${citation.url}`;
    case "mla9":
    case "mla8":
      return `${authors}. "${citation.title}." ${citation.url}, ${year}.`;
    case "chicago17":
    case "chicago17_notes":
      return `${authors}. "${citation.title}." Last modified ${year}. ${citation.url}.`;
    case "ama11":
    case "ama10":
      return `${index + 1}. ${authors}. ${citation.title}. ${citation.url}. Published ${year}.`;
    case "acs":
      return `${authors} ${citation.title}. ${citation.url} (${year}).`;
    case "ieee":
      return `[${index + 1}] ${authors}, "${citation.title}," ${citation.url}, ${year}.`;
    case "vancouver":
      return `${index + 1}. ${citation.authors[0] || "Unknown"} et al. ${citation.title}. ${year}. Available from: ${citation.url}`;
    case "harvard":
      return `${authors} (${year}) '${citation.title}'. Available at: ${citation.url}.`;
    default:
      return `${authors} (${year}). ${citation.title}. ${citation.url}`;
  }
}

function getSortedCitations(
  citations: Record<string, { title: string; authors: string[]; year?: number; url: string }>
) {
  return Object.entries(citations).sort(([, a], [, b]) => {
    const aLast = a.authors[0]?.split(" ").pop() || "";
    const bLast = b.authors[0]?.split(" ").pop() || "";
    return aLast.localeCompare(bLast);
  });
}

function buildReportMarkdown(
  report: LiteratureReport,
  citations: Record<string, { title: string; authors: string[]; year?: number; url: string }>,
  style: CitationStyle
) {
  let content = `# ${report.title}\n\n`;

  if (report.sections.length > 0) {
    for (const section of report.sections) {
      if (isReferencesSectionHeading(section.heading)) continue;
      content += `## ${section.heading}\n\n${section.content}\n\n`;
    }
  } else if (report.content) {
    content += report.content + "\n\n";
  }

  const references = getSortedCitations(citations).map(([, citation], index) =>
    formatReference(citation, style, index)
  );
  if (references.length > 0) {
    content += `## References\n\n${references.join("\n\n")}\n`;
  }

  return content;
}

function exportToMarkdown(report: LiteratureReport, filename: string) {
  const content = buildReportMarkdown(report, {}, report.citationStyle);
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const REPORT_TOOLBAR_BTN = cn(
  "inline-flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-normal text-foreground transition-colors",
  "hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
);

function ExportMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}

export const LiteratureReportView: React.FC<LiteratureReportViewProps> = ({
  report,
  toolbarLabel = "Literature Report",
  onBack,
  onExport,
  onSaveAndEdit,
  citations = {},
  workflowProvenance,
}) => {
  const [currentStyle, setCurrentStyle] = useState<CitationStyle>(report.citationStyle);
  const [didCopyReport, setDidCopyReport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleCopyReport = async () => {
    await navigator.clipboard.writeText(buildReportMarkdown(report, citations, currentStyle));
    setDidCopyReport(true);
    window.setTimeout(() => setDidCopyReport(false), 1600);
  };

  const handleExportPdf = () => {
    window.print();
  };

  const handleExportMarkdown = () => {
    if (onExport) {
      onExport();
      return;
    }
    exportToMarkdown(report, `${report.title.replace(/\s+/g, "_")}.md`);
  };

  const handleSaveAndEdit = async () => {
    if (!onSaveAndEdit) return;
    setIsSaving(true);
    try {
      await onSaveAndEdit();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-w-0 bg-background animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Mobile Back Button */}
      {onBack && (
        <div className="md:hidden flex h-14 shrink-0 items-center gap-2 px-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition text-foreground flex items-center justify-center shrink-0 touch-manipulation"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{toolbarLabel}</span>
        </div>
      )}

      {/* Top Bar — @container/report-toolbar sizes controls from panel width */}
      <div className="@container/report-toolbar flex h-14 shrink-0 items-center gap-2 px-4 border-b border-border bg-card min-w-0 overflow-hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <FileText className="hidden @min-[420px]/report-toolbar:block w-5 h-5 text-muted-foreground shrink-0" />
          <h2
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
            title={report.title}
          >
            {toolbarLabel}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleCopyReport}
            className={REPORT_TOOLBAR_BTN}
            title={didCopyReport ? "Copied report" : "Copy with citations"}
            aria-label={didCopyReport ? "Copied report" : "Copy with citations"}
          >
            {didCopyReport ? (
              <Check className="h-4 w-4 shrink-0" strokeWidth={2} />
            ) : (
              <Copy className="h-4 w-4 shrink-0" strokeWidth={2} />
            )}
            <span className="hidden @min-[520px]/report-toolbar:inline">
              {didCopyReport ? "Copied" : "Copy with citations"}
            </span>
          </button>
          <DropdownMenu
            trigger={
              <button
                type="button"
                className={REPORT_TOOLBAR_BTN}
                title="Export report"
                aria-label="Export report"
              >
                <Download className="h-4 w-4 shrink-0" strokeWidth={2} />
              </button>
            }
          >
            <ExportMenuItem
              icon={<Printer className="h-4 w-4" />}
              label="Export PDF"
              onClick={handleExportPdf}
            />
            <ExportMenuItem
              icon={<FileDown className="h-4 w-4" />}
              label="Export Markdown (.md)"
              onClick={handleExportMarkdown}
            />
          </DropdownMenu>
          <button
            type="button"
            onClick={handleSaveAndEdit}
            disabled={!onSaveAndEdit || isSaving}
            className={REPORT_TOOLBAR_BTN}
            title="Save & Edit Document"
            aria-label={isSaving ? "Saving document" : "Save and edit document"}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2} />
            ) : (
              <Save className="h-4 w-4 shrink-0" strokeWidth={2} />
            )}
            <span className="hidden @min-[700px]/report-toolbar:inline">
              {isSaving ? "Saving..." : "Save & Edit Document"}
            </span>
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className={REPORT_TOOLBAR_BTN}
              aria-label={`Close ${toolbarLabel.toLowerCase()}`}
              title="Close"
            >
              <X className="h-4 w-4 shrink-0" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 md:px-12 md:py-12">
          {/* Title */}
          <h1 className="text-3xl font-bold text-foreground mb-8 text-center">{report.title}</h1>

          {/* Sections */}
          {report.sections.length > 0 ? (
            report.sections
              .filter((section) => !isReferencesSectionHeading(section.heading))
              .map((section, index) => (
                <SectionRenderer
                  key={index}
                  section={section}
                  workflowProvenance={workflowProvenance}
                />
              ))
          ) : report.content ? (
            <div className="prose prose-stone dark:prose-invert max-w-none leading-relaxed text-foreground">
              <Suspense
                fallback={<div className="animate-pulse h-4 bg-secondary/30 rounded w-full" />}
              >
                <MarkdownRenderer>{sanitizeMarkdown(report.content)}</MarkdownRenderer>
              </Suspense>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No content available</p>
            </div>
          )}

          {/* References */}
          <ReferencesSection
            citations={citations}
            style={currentStyle}
            onStyleChange={setCurrentStyle}
          />
        </div>
      </div>
    </div>
  );
};
