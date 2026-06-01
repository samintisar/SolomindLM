import type { Id } from "@convex/_generated/dataModel";
import {
  BookOpen,
  CirclePlus,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  List,
  Loader2,
  Quote,
  Sheet,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { useToast } from "@/shared/contexts/useToast";
import { DropdownMenu } from "@/shared/ui/DropdownMenu";
import { useBulkUpload, useGetExistingPapers } from "../../sources/services/documentsApi";
import { useRankedPapersForSession } from "../services/literatureTablesApi";
import type { RankedPaper } from "../types/rankedPaper";
import { formatAuthorsLine, rankedPaperKey, sourceLabel } from "../types/rankedPaper";
import { exportPapersToBibtex, exportPapersToCsv, exportPapersToExcel } from "../utils/paperExport";
import { isPaperInNotebook, rankedPaperToBulkUpload } from "../utils/rankedPaperMappers";
import { CitePaperModal } from "./CitePaperModal";
import { ResizeHandle } from "./ResizeHandle";

interface LiteraturePapersPanelProps {
  sessionId: Id<"literatureReviewSessions">;
  notebookId: Id<"notebooks">;
  width: number;
  isResizing: boolean;
  onClose: () => void;
}

export const LiteraturePapersPanel: React.FC<LiteraturePapersPanelProps> = ({
  sessionId,
  notebookId,
  width,
  isResizing: _isResizing,
  onClose,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const data = useRankedPapersForSession(sessionId);

  const existingPapers = useGetExistingPapers(notebookId);

  const bulkUpload = useBulkUpload();

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [addingKeys, setAddingKeys] = useState<Set<string>>(new Set());
  const [citeTarget, setCiteTarget] = useState<{ paper: RankedPaper; index: number } | null>(null);
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  const papers: RankedPaper[] = data?.papers ?? [];
  const paperEntries = useMemo(
    () =>
      papers.map((paper: RankedPaper, index: number) => ({
        paper,
        index,
        key: rankedPaperKey(paper, index),
      })),
    [papers]
  );

  const selectedPapers = useMemo(
    () => paperEntries.filter((entry) => selectedKeys.has(entry.key)).map((entry) => entry.paper),
    [paperEntries, selectedKeys]
  );

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedKeys(new Set()), []);

  const addPapersToNotebook = useCallback(
    async (toAdd: RankedPaper[]) => {
      if (toAdd.length === 0) return;

      setIsBulkAdding(true);
      try {
        const result = await bulkUpload({
          notebookId,
          papers: toAdd.map(rankedPaperToBulkUpload),
        });
        if (result.imported > 0) {
          toastSuccess(
            result.imported === 1
              ? "Paper added to notebook"
              : `${result.imported} papers added to notebook`
          );
        }
        if (result.skipped > 0 && result.imported === 0) {
          toastError("Selected papers are already in this notebook");
        }
        clearSelection();
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Failed to add papers");
      } finally {
        setIsBulkAdding(false);
        setAddingKeys(new Set());
      }
    },
    [bulkUpload, clearSelection, notebookId, toastError, toastSuccess]
  );

  const handleAddSingle = useCallback(
    async (paper: RankedPaper, index: number) => {
      const key = rankedPaperKey(paper, index);
      setAddingKeys((prev) => new Set(prev).add(key));
      try {
        await addPapersToNotebook([paper]);
      } finally {
        setAddingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [addPapersToNotebook]
  );

  const exportFilenameBase = useMemo(() => {
    const q = (data?.query ?? "papers")
      .slice(0, 40)
      .replace(/[^\w\s-]/g, "")
      .trim();
    return q || "ranked-papers";
  }, [data?.query]);

  const isLoading = data === undefined;
  const isEmpty = data !== undefined && papers.length === 0;

  return (
    <>
      <div
        style={{ width }}
        className="relative shrink-0 bg-sidebar border-l-2 border-border h-full flex flex-col overflow-hidden"
      >
        <ResizeHandle width={width} position="left" />

        <PapersPanelHeader
          exportDisabled={papers.length === 0}
          exportFilenameBase={exportFilenameBase}
          papers={papers}
          onClose={onClose}
        />

        {selectedKeys.size > 0 && (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2 shrink-0">
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              {selectedKeys.size} selected
            </button>
            <button
              type="button"
              disabled={isBulkAdding}
              onClick={() => void addPapersToNotebook(selectedPapers)}
              className="text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50"
            >
              {isBulkAdding ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Adding…
                </span>
              ) : (
                `Add ${selectedKeys.size} to notebook`
              )}
            </button>
          </div>
        )}

        <PaperList
          isLoading={isLoading}
          isEmpty={isEmpty}
          paperEntries={paperEntries}
          selectedKeys={selectedKeys}
          addingKeys={addingKeys}
          existingPapers={existingPapers}
          onToggleSelect={toggleSelect}
          onCite={setCiteTarget}
          onAdd={handleAddSingle}
        />
      </div>

      {citeTarget && (
        <CitePaperModal
          paper={citeTarget.paper}
          paperIndex={citeTarget.index}
          isOpen
          onClose={() => setCiteTarget(null)}
        />
      )}
    </>
  );
};

const PAPERS_PANEL_HEADER_BTN =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-normal text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";

const PAPER_ACTION_CLASS =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 -my-0.5 text-foreground transition-colors hover:bg-secondary active:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none disabled:hover:bg-transparent";

function PapersPanelHeader({
  exportDisabled,
  exportFilenameBase,
  papers,
  onClose,
}: {
  exportDisabled: boolean;
  exportFilenameBase: string;
  papers: RankedPaper[];
  onClose: () => void;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background p-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <List className="h-4 w-4 shrink-0 text-foreground" strokeWidth={2} aria-hidden />
        <h2 className="truncate text-sm font-medium text-foreground">
          Selected Papers for Detailed Review
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <DropdownMenu
          trigger={
            <button
              type="button"
              disabled={exportDisabled}
              title="Export papers"
              className={PAPERS_PANEL_HEADER_BTN}
            >
              <Download className="h-4 w-4 shrink-0" strokeWidth={2} />
              Export
            </button>
          }
        >
          <ExportMenuItem
            icon={<FileCode2 className="h-4 w-4" />}
            label="BibTeX (.bib)"
            onClick={() => exportPapersToBibtex(papers, `${exportFilenameBase}.bib`)}
          />
          <ExportMenuItem
            icon={<Sheet className="h-4 w-4" />}
            label="CSV (.csv)"
            onClick={() => exportPapersToCsv(papers, `${exportFilenameBase}.csv`)}
          />
          <ExportMenuItem
            icon={<Table2 className="h-4 w-4" />}
            label="Excel (.xlsx)"
            onClick={() => exportPapersToExcel(papers, `${exportFilenameBase}.xlsx`)}
          />
        </DropdownMenu>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close papers panel"
          title="Close"
        >
          <X className="h-4 w-4 shrink-0" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

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

function PaperList({
  isLoading,
  isEmpty,
  paperEntries,
  selectedKeys,
  addingKeys,
  existingPapers,
  onToggleSelect,
  onCite,
  onAdd,
}: {
  isLoading: boolean;
  isEmpty: boolean;
  paperEntries: Array<{ paper: RankedPaper; index: number; key: string }>;
  selectedKeys: Set<string>;
  addingKeys: Set<string>;
  existingPapers: { dois: string[]; titleHashes: string[] } | undefined;
  onToggleSelect: (key: string) => void;
  onCite: (target: { paper: RankedPaper; index: number }) => void;
  onAdd: (paper: RankedPaper, index: number) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-sm">Loading ranked papers…</p>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-muted-foreground">
          <BookOpen className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium text-foreground">No ranked papers yet</p>
          <p className="text-xs mt-1">
            Papers appear here after the ranking step completes in your literature review.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {paperEntries.map(({ paper, index, key }) => (
            <RankedPaperCard
              key={key}
              rank={index + 1}
              paper={paper}
              isSelected={selectedKeys.has(key)}
              isAdding={addingKeys.has(key)}
              isInNotebook={existingPapers ? isPaperInNotebook(paper, existingPapers) : false}
              onToggleSelect={() => onToggleSelect(key)}
              onCite={() => onCite({ paper, index })}
              onAdd={() => void onAdd(paper, index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RankedPaperCardProps {
  rank: number;
  paper: RankedPaper;
  isSelected: boolean;
  isAdding: boolean;
  isInNotebook: boolean;
  onToggleSelect: () => void;
  onCite: () => void;
  onAdd: () => void;
}

const RankedPaperCard: React.FC<RankedPaperCardProps> = ({
  rank,
  paper,
  isSelected,
  isAdding,
  isInNotebook,
  onToggleSelect,
  onCite,
  onAdd,
}) => {
  const summary =
    paper.abstract.length > 320 ? `${paper.abstract.slice(0, 320).trim()}…` : paper.abstract;

  const pdfHref = paper.pdfUrl?.trim() || paper.url;
  const meta = [
    paper.citationCount != null ? `${paper.citationCount.toLocaleString()} Citations` : null,
    paper.year != null ? String(paper.year) : null,
    formatAuthorsLine(paper.authors),
  ]
    .filter(Boolean)
    .join(" · ");

  const scoreLabel =
    typeof paper.score === "number" && Number.isFinite(paper.score) ? paper.score.toFixed(2) : null;

  return (
    <article className="px-4 py-4 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
          aria-hidden
        >
          {rank}
        </span>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="mt-1 h-4 w-4 shrink-0 rounded border-border"
          aria-label={`Select ${paper.title}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-1">
            <SourceRow source={sourceLabel(paper.source)} />
            {scoreLabel ? (
              <span className="shrink-0 text-xs font-medium text-primary tabular-nums">
                Score {scoreLabel}
              </span>
            ) : null}
          </div>
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[15px] font-semibold leading-snug text-foreground hover:text-primary hover:underline line-clamp-3"
          >
            {paper.title}
          </a>
          {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
        </div>
      </div>

      {summary && (
        <div className="mt-3 flex gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
          <Sparkles className="h-4 w-4 shrink-0 text-orange-500 mt-0.5" strokeWidth={2} />
          <p>{summary}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1 text-sm">
        <PaperAction icon={<Quote className="h-4 w-4" />} label="Cite" onClick={onCite} />
        <PaperAction
          icon={
            isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CirclePlus className="h-4 w-4" strokeWidth={2} />
            )
          }
          label={isInNotebook ? "In notebook" : "Add to notebook"}
          onClick={onAdd}
          disabled={isInNotebook || isAdding}
        />
        <PaperAction icon={<FileText className="h-4 w-4" />} label="PDF" href={pdfHref} external />
        {paper.url && (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-orange-500 hover:text-orange-600"
            aria-label="Open paper"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </article>
  );
};

function SourceRow({ source }: { source: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
      <BookOpen className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{source}</span>
    </div>
  );
}

function PaperAction({
  icon,
  label,
  onClick,
  href,
  external,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  disabled?: boolean;
}) {
  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={PAPER_ACTION_CLASS}
        title={label === "PDF" ? "View PDF" : label}
      >
        {icon}
        <span>{label}</span>
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={PAPER_ACTION_CLASS}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
