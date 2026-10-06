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
  Printer,
  Save,
  X,
} from "lucide-react";
import React, { lazy, Suspense, useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Spinner } from "@/shared/components/ui/spinner";
import { sanitizeMarkdown } from "@/shared/utils";
import { CitationStyle, CitationStylePicker } from "../CitationStylePicker";
import { hasPrismaCounts, type PrismaFlowCounts, PrismaFlowDiagram } from "../PrismaFlowDiagram";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

// ── Types ────────────────────────────────────────────────────────────────

interface ReportSection {
  heading: string;
  content: string;
}

interface LiteratureReport {
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
  const showPrismaDiagram = isMethods && workflowProvenance && hasPrismaCounts(workflowProvenance);

  return (
    <section className="mb-8">
      <h2 className="mb-3 border-b border-border/50 pb-2 font-display text-xl font-semibold">
        {section.heading}
      </h2>
      {showPrismaDiagram ? (
        <PrismaFlowDiagram counts={workflowProvenance} className="mb-6" />
      ) : null}
      <div className="prose max-w-none font-serif">
        <Suspense fallback={<Skeleton className="h-4 w-full" />}>
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
  citationStyle: CitationStyle;
  onStyleChange: (style: CitationStyle) => void;
}

const ReferencesSection: React.FC<ReferencesSectionProps> = ({
  citations,
  citationStyle,
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
    formatReference(citation, citationStyle, index)
  );

  const handleCopyReferences = async () => {
    await navigator.clipboard.writeText(formattedReferences.join("\n\n"));
    setDidCopy(true);
    window.setTimeout(() => setDidCopy(false), 1600);
  };

  return (
    <section className="mt-12 border-t border-border/50 pt-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">References</h2>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleCopyReferences}
            title={didCopy ? "Copied citations" : "Copy all citations"}
            aria-label={didCopy ? "Copied citations" : "Copy all citations"}
          >
            {didCopy ? <Check /> : <Copy />}
          </Button>
          <CitationStylePicker value={citationStyle} onChange={onStyleChange} className="w-42" />
        </div>
      </div>
      <ul className="space-y-4">
        {sortedCitations.map(([key], index) => (
          <li key={key} className="pl-4 -indent-4 text-sm leading-relaxed">
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
    <div className="flex h-full min-w-0 animate-in flex-col bg-background duration-300 fade-in slide-in-from-right-4">
      {/* Mobile Back Button */}
      {onBack && (
        <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-background/80 px-4 backdrop-blur-sm md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
          <span className="truncate text-sm font-semibold">{toolbarLabel}</span>
        </div>
      )}

      {/* Top Bar — @container/report-toolbar sizes controls from panel width */}
      <div className="@container/report-toolbar flex h-14 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-border/50 bg-card px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <FileText className="hidden size-5 shrink-0 text-muted-foreground @sm/report-toolbar:block" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium" title={report.title}>
            {toolbarLabel}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm-adaptive"
            onClick={handleCopyReport}
            title={didCopyReport ? "Copied report" : "Copy with citations"}
            aria-label={didCopyReport ? "Copied report" : "Copy with citations"}
          >
            {didCopyReport ? <Check /> : <Copy />}
            <span className="hidden @lg/report-toolbar:inline">
              {didCopyReport ? "Copied" : "Copy with citations"}
            </span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-md"
                title="Export report"
                aria-label="Export report"
              >
                <Download />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleExportPdf}>
                <Printer />
                Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportMarkdown}>
                <FileDown />
                Export Markdown (.md)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm-adaptive"
            onClick={handleSaveAndEdit}
            disabled={!onSaveAndEdit || isSaving}
            title="Save & Edit Document"
            aria-label={isSaving ? "Saving document" : "Save and edit document"}
          >
            {isSaving ? <Spinner aria-hidden /> : <Save />}
            <span className="hidden @2xl/report-toolbar:inline">
              {isSaving ? "Saving..." : "Save & Edit Document"}
            </span>
          </Button>
          {onBack && (
            <Button
              variant="ghost"
              size="icon-md"
              onClick={onBack}
              aria-label={`Close ${toolbarLabel.toLowerCase()}`}
              title="Close"
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8 md:px-12 md:py-12">
          {/* Title */}
          <h1 className="mb-8 text-center font-display text-3xl font-bold">{report.title}</h1>

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
            <div className="prose max-w-none font-serif">
              <Suspense fallback={<Skeleton className="h-4 w-full" />}>
                <MarkdownRenderer>{sanitizeMarkdown(report.content)}</MarkdownRenderer>
              </Suspense>
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>No content available</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {/* References */}
          <ReferencesSection
            citations={citations}
            citationStyle={currentStyle}
            onStyleChange={setCurrentStyle}
          />
        </div>
      </div>
    </div>
  );
};
