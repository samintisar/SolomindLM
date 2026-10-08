import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  ChevronDown,
  Columns3,
  Download,
  FileText,
  Maximize2,
  Minimize2,
  Plus,
  Save,
  Sheet,
  Table2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBulkUpload, useGetExistingPapers } from "@/features/sources/services/documentsApi";
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
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { Spinner } from "@/shared/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { useToast } from "@/shared/contexts/useToast";
import { cn } from "@/shared/utils/cn";
import { downloadBlob } from "@/shared/utils/downloadFile";
import type { TablePaperRow } from "../../utils/literatureTablePaper";
import {
  citationToRankedPaper,
  getPaperTitle,
  isDataColumn,
  isTablePaperInNotebook,
  tableCitationToBulkUpload,
} from "../../utils/literatureTablePaper";
import { CitePaperModal } from "../CitePaperModal";
import { ColumnManager, type TableColumn } from "../ColumnManager";
import { LiteratureTableExtractionCell } from "../LiteratureTableExtractionCell";
import { LiteratureTablePaperCell } from "../LiteratureTablePaperCell";

type TablePaper = TablePaperRow;

/**
 * Narrowest table area (px) that fits the column manager beside the table. Narrower, the manager
 * opens over the table, so it starts closed.
 */
const COLUMN_MANAGER_BESIDE_TABLE_MIN_WIDTH = 896;

/**
 * Below `@4xl` the paper column scrolls with the rest at a narrower width: pinned at full width it
 * would leave too little room to scroll the data columns under it.
 */
const PAPER_COLUMN_CLASS =
  "min-w-72 @max-4xl/literature-table:static @4xl/literature-table:min-w-105";
const DATA_COLUMN_CLASS = "min-w-64 @4xl/literature-table:min-w-70";

export interface LiteratureTable {
  title: string;
  columns: TableColumn[];
  papers: TablePaper[];
}

export interface LiteratureTableViewProps {
  table: LiteratureTable;
  notebookId: Id<"notebooks">;
  onBack?: () => void;
  onSave?: (table: LiteratureTable) => void | Promise<void>;
  isSaving?: boolean;
  onExport?: (format: "csv" | "excel") => void;
  onAddPapers?: () => void;
}

function exportToCSV(table: LiteratureTable, filename: string) {
  const dataColumns = table.columns.filter(isDataColumn).sort((a, b) => a.order - b.order);
  const headers = ["Paper", ...dataColumns.map((c) => c.name)];

  const rows = table.papers
    .filter((paper) => paper.isIncluded)
    .map((paper) => {
      const title = getPaperTitle(paper, table.columns);
      const values = dataColumns.map((col) => paper.rowData[col.id] || "");
      return [title, ...values];
    });

  const escapeCSV = (value: string) => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csvContent = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) => row.map(escapeCSV).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}

function exportToExcel(table: LiteratureTable, filename: string) {
  exportToCSV(table, filename);
}

export const LiteratureTableView: React.FC<LiteratureTableViewProps> = ({
  table: initialTable,
  notebookId,
  onBack,
  onSave,
  isSaving = false,
  onExport,
  onAddPapers,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [table, setTable] = useState<LiteratureTable>(initialTable);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [citeTarget, setCiteTarget] = useState<{ paper: TablePaper; index: number } | null>(null);

  /** Whether the column manager fits beside the table; null until the table area is measured. */
  const [fitsBeside, setFitsBeside] = useState<boolean | null>(null);
  const previousFitsBeside = useRef<boolean | null>(null);
  const manageColumnsButtonRef = useRef<HTMLButtonElement>(null);

  // A callback ref, so a remount (entering or leaving full screen) observes the new node.
  const observeTableBody = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => setFitsBeside(node.clientWidth >= COLUMN_MANAGER_BESIDE_TABLE_MIN_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Open the manager on first measure only where it fits beside the table, and close it if the
  // panel narrows so it would cover the table the user never asked it to cover.
  useLayoutEffect(() => {
    const previous = previousFitsBeside.current;
    previousFitsBeside.current = fitsBeside;
    if (previous === null && fitsBeside) setShowColumnManager(true);
    else if (previous && fitsBeside === false) setShowColumnManager(false);
  }, [fitsBeside]);

  const existingPapers = useGetExistingPapers(notebookId);
  const bulkUpload = useBulkUpload();

  const dataColumns = useMemo(
    () => table.columns.filter(isDataColumn).sort((a, b) => a.order - b.order),
    [table.columns]
  );

  const includedPapers = useMemo(() => table.papers.filter((p) => p.isIncluded), [table.papers]);

  const allSelected =
    includedPapers.length > 0 && includedPapers.every((p) => selectedIds.has(p.citationId));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(includedPapers.map((p) => p.citationId)));
  }, [allSelected, includedPapers]);

  const toggleSelect = useCallback((citationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(citationId)) next.delete(citationId);
      else next.add(citationId);
      return next;
    });
  }, []);

  const handleColumnsChange = useCallback((newColumns: TableColumn[]) => {
    setTable((prev) => ({ ...prev, columns: newColumns }));
  }, []);

  const addPapersToNotebook = useCallback(
    async (papers: TablePaper[]) => {
      // Papers from the user's notebook are already in it.
      const withCitation = papers.filter(
        (p): p is TablePaper & { citation: NonNullable<TablePaper["citation"]> } =>
          Boolean(p.citation) && p.citation?.sourceApi !== "notebook"
      );
      if (withCitation.length === 0) {
        if (papers.some((p) => p.citation?.sourceApi === "notebook")) {
          toastError("Selected papers are already in this notebook");
        }
        return;
      }

      setIsBulkAdding(true);
      try {
        const result = await bulkUpload({
          notebookId,
          papers: withCitation.map((p) => tableCitationToBulkUpload(p.citation)),
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
        setSelectedIds(new Set());
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Failed to add papers");
      } finally {
        setIsBulkAdding(false);
        setAddingIds(new Set());
      }
    },
    [bulkUpload, notebookId, toastError, toastSuccess]
  );

  const handleAddSingle = useCallback(
    async (paper: TablePaper) => {
      setAddingIds((prev) => new Set(prev).add(paper.citationId));
      try {
        await addPapersToNotebook([paper]);
      } finally {
        setAddingIds((prev) => {
          const next = new Set(prev);
          next.delete(paper.citationId);
          return next;
        });
      }
    },
    [addPapersToNotebook]
  );

  const selectedPapers = useMemo(
    () => table.papers.filter((p) => selectedIds.has(p.citationId)),
    [table.papers, selectedIds]
  );

  const columnManagerOpen = showColumnManager && !isFocusMode;
  const columnManagerCoversTable = columnManagerOpen && fitsBeside === false;

  const closeColumnManager = useCallback(() => {
    setShowColumnManager(false);
    manageColumnsButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!columnManagerCoversTable) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeColumnManager();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeColumnManager, columnManagerCoversTable]);

  const handleExportCSV = useCallback(() => {
    if (onExport) onExport("csv");
    else exportToCSV(table, `${table.title.replace(/\s+/g, "_")}.csv`);
  }, [onExport, table]);

  const handleExportExcel = useCallback(() => {
    if (onExport) onExport("excel");
    else exportToExcel(table, `${table.title.replace(/\s+/g, "_")}.xlsx`);
  }, [onExport, table]);

  const exportDisabled = table.papers.length === 0;
  const paperCount = includedPapers.length;

  useEffect(() => {
    if (!isFocusMode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // An open menu or dialog handles its own Escape (Radix prevents the default).
      if (event.key === "Escape" && !event.defaultPrevented) {
        setIsFocusMode(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFocusMode]);

  const shellClassName = cn(
    "flex min-w-0 flex-col bg-background",
    isFocusMode
      ? "fixed inset-x-0 top-14 bottom-0 z-60"
      : "h-full animate-in fade-in slide-in-from-right-4 duration-300 ease-out"
  );

  const tableShell = (
    <div className={shellClassName} data-literature-table-shell>
      {onBack && !isFocusMode && (
        <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-background/80 px-4 backdrop-blur-sm md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
          <span className="truncate text-sm font-semibold">{table.title}</span>
        </div>
      )}

      <div className="@container/table-toolbar flex h-14 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-border/50 bg-card px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <Table2 className="hidden size-5 shrink-0 text-muted-foreground @sm/table-toolbar:block" />
          <h1
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
            title={table.title}
          >
            {table.title}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onAddPapers && (
            <Button
              variant="ghost"
              size="sm-adaptive"
              onClick={onAddPapers}
              title="Add papers"
              aria-label="Add papers"
            >
              <Plus />
              <span className="hidden @xl/table-toolbar:inline">Add Papers</span>
            </Button>
          )}
          <Button
            ref={manageColumnsButtonRef}
            variant={columnManagerOpen ? "secondary" : "ghost"}
            size="sm-adaptive"
            onClick={() => {
              setIsFocusMode(false);
              setShowColumnManager((open) => !open);
            }}
            title="Manage columns"
            aria-label="Manage columns"
            aria-pressed={columnManagerOpen}
          >
            <Columns3 />
            <span className="hidden @2xl/table-toolbar:inline">Manage Columns</span>
          </Button>
          <Button
            variant="ghost"
            size="sm-adaptive"
            onClick={() => void onSave?.(table)}
            disabled={!onSave || isSaving}
            title="Save table to Studio"
            aria-label={isSaving ? "Saving table" : "Save table to Studio"}
          >
            {isSaving ? <Spinner aria-hidden /> : <Save />}
            <span className="hidden @3xl/table-toolbar:inline">
              {isSaving ? "Saving..." : "Save table"}
            </span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm-adaptive"
                disabled={exportDisabled}
                title="Export table"
                aria-label="Export table"
              >
                <Download />
                <span className="hidden @4xl/table-toolbar:inline">Export</span>
                <ChevronDown className="hidden text-muted-foreground @4xl/table-toolbar:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleExportCSV}>
                <Sheet />
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportExcel}>
                <Table2 />
                Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-md"
            onClick={() => {
              setIsFocusMode((focus) => {
                const next = !focus;
                if (next) setShowColumnManager(false);
                return next;
              });
            }}
            aria-label={isFocusMode ? "Exit full screen" : "Full screen table"}
            title={isFocusMode ? "Exit full screen" : "Full screen"}
          >
            {isFocusMode ? <Minimize2 /> : <Maximize2 />}
          </Button>
          {onBack && (
            <Button
              variant="ghost"
              size="icon-md"
              onClick={onBack}
              aria-label="Close table"
              title="Close"
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-4 py-2">
          <Button variant="ghost" size="xs" onClick={() => setSelectedIds(new Set())}>
            <X />
            {selectedIds.size} selected
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
              `Add ${selectedIds.size} to notebook`
            )}
          </Button>
        </div>
      )}

      {/* Narrow widths: the column manager covers the table, and the paper column scrolls with the
          rest instead of pinning (pinned, its width alone fills a phone screen). */}
      <div ref={observeTableBody} className="@container/table-body relative flex min-h-0 flex-1">
        <div
          className="@container/literature-table flex min-w-0 flex-1 flex-col bg-card"
          inert={columnManagerCoversTable || undefined}
        >
          {table.papers.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>No papers in this table yet</EmptyTitle>
              </EmptyHeader>
              {onAddPapers && (
                <EmptyContent>
                  <Button onClick={onAddPapers}>Add Papers</Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <Table containerClassName="min-h-0 flex-1" className="@4xl/literature-table:min-w-275">
              <TableHeader sticky>
                <TableRow>
                  <TableHead pinned className={PAPER_COLUMN_CLASS}>
                    <div className="flex items-center gap-3 pl-9.5">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all papers"
                      />
                      <span>Papers ({paperCount})</span>
                    </div>
                  </TableHead>
                  {dataColumns.map((col) => (
                    <TableHead key={col.id} className={DATA_COLUMN_CLASS}>
                      {col.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  let visibleRank = 0;
                  return table.papers.map((paper, index) => {
                    if (!paper.isIncluded) return null;
                    visibleRank += 1;
                    const inNotebook =
                      paper.citation && existingPapers
                        ? isTablePaperInNotebook(paper.citation, existingPapers)
                        : false;
                    const isSelected = selectedIds.has(paper.citationId);

                    return (
                      <TableRow
                        key={paper.citationId}
                        data-state={isSelected ? "selected" : undefined}
                      >
                        <TableCell pinned className={PAPER_COLUMN_CLASS}>
                          <LiteratureTablePaperCell
                            rank={visibleRank}
                            paper={paper}
                            columns={table.columns}
                            isSelected={isSelected}
                            isAdding={addingIds.has(paper.citationId)}
                            isInNotebook={inNotebook}
                            onToggleSelect={() => toggleSelect(paper.citationId)}
                            onCite={() => setCiteTarget({ paper, index })}
                            onAddToNotebook={() => void handleAddSingle(paper)}
                          />
                        </TableCell>
                        {dataColumns.map((col) => (
                          <TableCell key={col.id} className={DATA_COLUMN_CLASS}>
                            <LiteratureTableExtractionCell value={paper.rowData[col.id] ?? ""} />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  });
                })()}
              </TableBody>
            </Table>
          )}
        </div>

        {columnManagerOpen && (
          <ColumnManager
            columns={table.columns}
            onChange={handleColumnsChange}
            onClose={closeColumnManager}
            className={
              columnManagerCoversTable
                ? "absolute inset-y-0 right-0 z-30 w-full @md/table-body:w-88"
                : undefined
            }
            focusOnMount={columnManagerCoversTable}
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      {isFocusMode && typeof document !== "undefined"
        ? createPortal(tableShell, document.body)
        : tableShell}

      {citeTarget?.paper.citation && (
        <CitePaperModal
          paper={citationToRankedPaper(citeTarget.paper.citation)}
          paperIndex={citeTarget.index}
          isOpen
          onClose={() => setCiteTarget(null)}
        />
      )}
    </>
  );
};
