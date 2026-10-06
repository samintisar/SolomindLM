import type { Id } from "@convex/_generated/dataModel";
import {
  BookOpen,
  CirclePlus,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  List,
  Quote,
  Sheet,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { Spinner } from "@/shared/components/ui/spinner";
import { useToast } from "@/shared/contexts/useToast";
import { useBulkUpload, useGetExistingPapers } from "../../sources/services/documentsApi";
import { useRankedPapersForSession } from "../services/literatureTablesApi";
import type { RankedPaper } from "../types/rankedPaper";
import { formatAuthorsLine, rankedPaperKey, sourceLabel } from "../types/rankedPaper";
import { exportPapersToBibtex, exportPapersToCsv, exportPapersToExcel } from "../utils/paperExport";
import { isPaperInNotebook, rankedPaperToBulkUpload } from "../utils/rankedPaperMappers";
import { CitePaperModal } from "./CitePaperModal";

interface LiteraturePapersPanelProps {
  sessionId: Id<"literatureReviewSessions">;
  notebookId: Id<"notebooks">;
  onClose: () => void;
}

export const LiteraturePapersPanel: React.FC<LiteraturePapersPanelProps> = ({
  sessionId,
  notebookId,
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
      <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-border/50 bg-sidebar">
        <PapersPanelHeader
          exportDisabled={papers.length === 0}
          exportFilenameBase={exportFilenameBase}
          papers={papers}
          onClose={onClose}
        />

        {selectedKeys.size > 0 && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-4 py-2">
            <Button variant="ghost" size="xs" onClick={clearSelection}>
              <X />
              {selectedKeys.size} selected
            </Button>
            <Button
              variant="secondary"
              size="xs"
              disabled={isBulkAdding}
              onClick={() => void addPapersToNotebook(selectedPapers)}
            >
              {isBulkAdding ? (
                <>
                  <Spinner aria-hidden />
                  Adding…
                </>
              ) : (
                `Add ${selectedKeys.size} to notebook`
              )}
            </Button>
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
    <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-background px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <List className="size-4 shrink-0 text-foreground" aria-hidden />
        <h2 className="truncate font-sans text-sm font-medium text-foreground">
          Selected Papers for Detailed Review
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={exportDisabled}
              title="Export papers"
              aria-label="Export papers"
            >
              <Download />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => exportPapersToBibtex(papers, `${exportFilenameBase}.bib`)}
            >
              <FileCode2 />
              BibTeX (.bib)
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => exportPapersToCsv(papers, `${exportFilenameBase}.csv`)}
            >
              <Sheet />
              CSV (.csv)
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => exportPapersToExcel(papers, `${exportFilenameBase}.xlsx`)}
            >
              <Table2 />
              Excel (.xlsx)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-md"
          onClick={onClose}
          aria-label="Close papers panel"
          title="Close"
        >
          <X />
        </Button>
      </div>
    </div>
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
        <div
          role="status"
          className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground"
        >
          <Spinner aria-hidden className="size-6" />
          <p>Loading ranked papers…</p>
        </div>
      ) : isEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>No ranked papers yet</EmptyTitle>
            <EmptyDescription>
              Papers appear here after the ranking step completes in your literature review.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="divide-y divide-border/50">
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
    <article className="px-4 py-4 transition-colors hover:bg-muted/30">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-sans text-xs font-semibold text-muted-foreground"
          aria-hidden
        >
          {rank}
        </span>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect()}
          className="mt-1"
          aria-label={`Select ${paper.title}`}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <SourceRow source={sourceLabel(paper.source)} />
            {scoreLabel ? (
              <span className="shrink-0 font-sans text-xs font-medium tabular-nums text-primary">
                Score {scoreLabel}
              </span>
            ) : null}
          </div>
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-3 text-sm font-semibold leading-snug text-foreground hover:text-primary hover:underline"
          >
            {paper.title}
          </a>
          {meta && <p className="mt-1 font-sans text-xs text-muted-foreground">{meta}</p>}
        </div>
      </div>

      {summary && (
        <div className="mt-3 flex gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-studio-literature" aria-hidden />
          <p>{summary}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <PaperAction icon={<Quote aria-hidden />} label="Cite" onClick={onCite} />
        <PaperAction
          icon={isAdding ? <Spinner aria-hidden /> : <CirclePlus aria-hidden />}
          label={isAdding ? "Adding…" : isInNotebook ? "In notebook" : "Add to notebook"}
          onClick={onAdd}
          disabled={isInNotebook || isAdding}
        />
        {pdfHref && (
          <PaperAction icon={<FileText aria-hidden />} label="PDF" href={pdfHref} external />
        )}
        {paper.url && (
          <Button variant="ghost" size="icon-sm" asChild className="ml-auto">
            <a href={paper.url} target="_blank" rel="noopener noreferrer" aria-label="Open paper">
              <ExternalLink className="text-studio-literature" />
            </a>
          </Button>
        )}
      </div>
    </article>
  );
};

function SourceRow({ source }: { source: string }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 font-sans text-xs text-muted-foreground">
      <BookOpen className="size-3.5 shrink-0" aria-hidden />
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
      <Button variant="ghost" size="xs" asChild>
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          title={label === "PDF" ? "View PDF" : label}
          aria-label={label === "PDF" ? "View PDF" : undefined}
        >
          {icon}
          {label}
        </a>
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="xs" onClick={onClick} disabled={disabled}>
      {icon}
      {label}
    </Button>
  );
}
