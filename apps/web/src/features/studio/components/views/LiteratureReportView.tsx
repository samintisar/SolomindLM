import React, { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { ArrowLeft, Download, FileText, BookOpen } from "lucide-react";
import { CitationStylePicker, CitationStyle } from "../CitationStylePicker";

// TODO: Import CitationEngine once it's fully implemented with all styles
// import { createCitationEngine, Citation } from "@convex/_utils/CitationEngine";

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
  onBack?: () => void;
  onExport?: () => void;
  // TODO: Pass actual citation data from parent
  citations?: Record<string, { title: string; authors: string[]; year?: number; url: string }>;
}

// ── Inline Citation Component ────────────────────────────────────────────

interface InlineCitationProps {
  citationKey: string;
  citation?: { title: string; authors: string[]; year?: number; url: string };
}

const InlineCitation: React.FC<InlineCitationProps> = ({ citationKey, citation }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="text-primary font-medium cursor-help underline decoration-dotted underline-offset-2">
        [{citationKey}]
      </span>

      {showTooltip && citation && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 bg-popover border border-border rounded-lg shadow-lg z-50">
          <div className="text-sm font-medium text-popover-foreground mb-1">
            {citation.title}
          </div>
          <div className="text-xs text-muted-foreground">
            {citation.authors.join(", ")}
            {citation.year && ` (${citation.year})`}
          </div>
          {citation.url && (
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline mt-1 inline-block"
              onClick={(e) => e.stopPropagation()}
            >
              View source
            </a>
          )}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45"></div>
          </div>
        </div>
      )}
    </span>
  );
};

// ── Section Renderer ─────────────────────────────────────────────────────

interface SectionRendererProps {
  section: ReportSection;
  citations: Record<string, { title: string; authors: string[]; year?: number; url: string }>;
}

const SectionRenderer: React.FC<SectionRendererProps> = ({ section, citations }) => {
  // Parse content for citation markers like [Smith2024] or (Smith et al., 2024)
  const parseContent = useCallback(
    (content: string): React.ReactNode[] => {
      const parts: React.ReactNode[] = [];
      // Match [CitationKey] or (Author, Year) patterns
      const regex = /(\[[A-Za-z0-9]+\])|(\([A-Za-z\s]+(?:et\s+al\.?)?,\s*\d{4}[a-z]?\))/g;
      let lastIndex = 0;
      let match;

      const contentStr = content;
      // We need to reset regex to use it properly with exec
      const globalRegex = new RegExp(regex.source, "g");

      while ((match = globalRegex.exec(contentStr)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          parts.push(
            <span key={`text-${lastIndex}`}>{contentStr.slice(lastIndex, match.index)}</span>
          );
        }

        const citationText = match[0];
        const citationKey = citationText.replace(/[\[\]()]/g, "");
        const citation = citations[citationKey];

        parts.push(
          <InlineCitation
            key={`cite-${match.index}`}
            citationKey={citationKey}
            citation={citation}
          />
        );

        lastIndex = match.index + citationText.length;
      }

      // Add remaining text
      if (lastIndex < contentStr.length) {
        parts.push(
          <span key={`text-${lastIndex}`}>{contentStr.slice(lastIndex)}</span>
        );
      }

      return parts.length > 0 ? parts : [<span key="full">{contentStr}</span>];
    },
    [citations]
  );

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-foreground mb-3 pb-2 border-b border-border">
        {section.heading}
      </h2>
      <div className="prose prose-stone dark:prose-invert max-w-none leading-relaxed text-foreground">
        {parseContent(section.content)}
      </div>
    </section>
  );
};

// ── References Section ───────────────────────────────────────────────────

interface ReferencesSectionProps {
  citations: Record<string, { title: string; authors: string[]; year?: number; url: string }>;
  style: CitationStyle;
}

const ReferencesSection: React.FC<ReferencesSectionProps> = ({ citations, style }) => {
  // TODO: Use CitationEngine.formatReference when fully implemented
  const formatReference = useCallback(
    (citation: { title: string; authors: string[]; year?: number; url: string }): string => {
      const authors = citation.authors.join(", ");
      const year = citation.year || "n.d.";

      switch (style) {
        case "apa7":
          return `${authors} (${year}). ${citation.title}. ${citation.url}`;
        case "mla9":
          return `${authors}. "${citation.title}." ${citation.url}, ${year}.`;
        case "chicago17":
          return `${authors}. "${citation.title}." Last modified ${year}. ${citation.url}.`;
        case "ieee":
          return `[1] ${authors}, "${citation.title}," ${citation.url}, ${year}.`;
        case "vancouver":
          return `${citation.authors[0] || "Unknown"} et al. ${citation.title}. ${year}. Available from: ${citation.url}`;
        case "harvard":
          return `${authors} (${year}) '${citation.title}'. Available at: ${citation.url}.`;
        default:
          return `${authors} (${year}). ${citation.title}. ${citation.url}`;
      }
    },
    [style]
  );

  const sortedCitations = useMemo(() => {
    return Object.entries(citations).sort(([, a], [, b]) => {
      const aLast = a.authors[0]?.split(" ").pop() || "";
      const bLast = b.authors[0]?.split(" ").pop() || "";
      return aLast.localeCompare(bLast);
    });
  }, [citations]);

  if (sortedCitations.length === 0) return null;

  return (
    <section className="mt-12 pt-8 border-t-2 border-border">
      <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
        <BookOpen className="w-5 h-5" />
        References
      </h2>
      <ul className="space-y-4">
        {sortedCitations.map(([key, citation]) => (
          <li key={key} className="pl-4 -indent-4 text-sm text-foreground leading-relaxed">
            {formatReference(citation)}
          </li>
        ))}
      </ul>
    </section>
  );
};

// ── Main Component ───────────────────────────────────────────────────────

export const LiteratureReportView: React.FC<LiteratureReportViewProps> = ({
  report,
  onBack,
  onExport,
  citations = {},
}) => {
  const [currentStyle, setCurrentStyle] = useState<CitationStyle>(report.citationStyle);

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Mobile Back Button */}
      {onBack && (
        <div className="md:hidden flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition-colors transition-transform text-foreground flex items-center justify-center shrink-0 touch-manipulation"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{report.title}</span>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="hidden md:flex p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground"
              aria-label="Back to Studio"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
            <h2 className="text-lg font-semibold text-foreground truncate">
              {report.title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">Style:</span>
            <CitationStylePicker
              value={currentStyle}
              onChange={setCurrentStyle}
            />
          </div>
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary transition-colors text-foreground"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 md:px-12 md:py-12">
          {/* Title */}
          <h1 className="text-3xl font-bold text-foreground mb-8 text-center">
            {report.title}
          </h1>

          {/* Sections */}
          {report.sections.length > 0 ? (
            report.sections.map((section, index) => (
              <SectionRenderer
                key={index}
                section={section}
                citations={citations}
              />
            ))
          ) : report.content ? (
            <div className="prose prose-stone dark:prose-invert max-w-none leading-relaxed text-foreground">
              <Suspense
                fallback={<div className="animate-pulse h-4 bg-secondary/30 rounded w-full" />}
              >
                <MarkdownRenderer>{report.content}</MarkdownRenderer>
              </Suspense>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No content available</p>
            </div>
          )}

          {/* References */}
          <ReferencesSection citations={citations} style={currentStyle} />
        </div>
      </div>
    </div>
  );
};
