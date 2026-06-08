import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  ChevronDown,
  Columns3,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Save,
  Sheet,
  Table2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useBulkUpload, useGetExistingPapers } from "@/features/sources/services/documentsApi";
import { useToast } from "@/shared/contexts/useToast";
import { DropdownMenu } from "@/shared/ui/DropdownMenu";
import { isNativeShell } from "@/utils/platformDetection";
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

export type { TableColumn };

export interface TablePaper {
  citationId: string;
  rowData: Record<string, string>;
  includeReason?: string;
  isIncluded: boolean;
  citation: TablePaperRow["citation"];
}

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

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Sticky table chrome — separate borders + explicit z-index avoid header/body overlap glitches. */
const TABLE_HEADER_BG =
  "bg-muted/95 backdrop-blur-[2px] supports-[backdrop-filter]:bg-muted/90 dark:bg-muted/85";
/** Matches ColumnManager panel header (`h-14` + centered content). */
const TABLE_HEADER_CELL = cn(
  "sticky top-0 z-20 h-14 border-b border-border/80 px-5 py-0 align-middle",
  TABLE_HEADER_BG
);
const TABLE_CORNER_HEADER = cn(
  TABLE_HEADER_CELL,
  "sticky left-0 z-30 min-w-[420px] border-r border-border/80 text-left",
  "shadow-[4px_0_10px_-6px_rgba(0,0,0,0.12)] dark:shadow-[4px_0_10px_-6px_rgba(0,0,0,0.35)]"
);
const TABLE_DATA_HEADER = cn(
  TABLE_HEADER_CELL,
  "min-w-[280px] border-r border-border/80 text-left text-sm font-medium text-muted-foreground last:border-r-0"
);
const TABLE_STICKY_BODY_CELL = cn(
  "sticky left-0 z-[5] min-w-[420px] border-r border-b border-border/80 bg-background px-5 py-5",
  "shadow-[4px_0_10px_-6px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_10px_-6px_rgba(0,0,0,0.3)]"
);
const TABLE_DATA_BODY_CELL =
  "min-w-[280px] border-r border-b border-border/80 px-5 py-5 align-top last:border-r-0";

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
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportToExcel(table: LiteratureTable, filename: string) {
  exportToCSV(table, filename);
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

const TABLE_TOOLBAR_BTN = cn(
  "inline-flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-normal text-foreground transition-colors",
  "hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
);

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
  const [showColumnManager, setShowColumnManager] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [citeTarget, setCiteTarget] = useState<{ paper: TablePaper; index: number } | null>(null);

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

  const handleSavePreset = useCallback((name: string, columns: TableColumn[]) => {
    console.log("Save preset:", name, columns);
  }, []);

  const addPapersToNotebook = useCallback(
    async (papers: TablePaper[]) => {
      const withCitation = papers.filter(
        (p): p is TablePaper & { citation: NonNullable<TablePaper["citation"]> } =>
          Boolean(p.citation)
      );
      if (withCitation.length === 0) return;

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
      if (event.key === "Escape") {
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
    "flex flex-col min-w-0 bg-background",
    isFocusMode
      ? cn(
          "fixed z-[60] flex flex-col bg-background",
          isNativeShell() ? "inset-0" : "top-14 left-0 right-0 bottom-0"
        )
      : "h-full animate-in fade-in slide-in-from-right-4 duration-300"
  );

  const tableShell = (
    <div className={shellClassName} data-literature-table-shell>
      {onBack && !isFocusMode && (
        <div className="md:hidden flex h-14 shrink-0 items-center gap-2 px-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition-colors transition-transform text-foreground flex items-center justify-center shrink-0 touch-manipulation"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{table.title}</span>
        </div>
      )}

      <div className="@container/table-toolbar flex h-14 shrink-0 items-center gap-2 px-4 border-b border-border bg-card min-w-0 overflow-hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <Table2 className="hidden @min-[420px]/table-toolbar:block h-5 w-5 shrink-0 text-muted-foreground" />
          <h1
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
            title={table.title}
          >
            {table.title}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onAddPapers}
            title="Add papers"
            className={TABLE_TOOLBAR_BTN}
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="hidden @min-[640px]/table-toolbar:inline">Add Papers</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsFocusMode(false);
              setShowColumnManager((open) => !open);
            }}
            title="Manage columns"
            aria-pressed={columnManagerOpen}
            className={cn(TABLE_TOOLBAR_BTN, columnManagerOpen && "bg-secondary")}
          >
            <Columns3 className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="hidden @min-[720px]/table-toolbar:inline">Manage Columns</span>
          </button>
          <button
            type="button"
            onClick={() => void onSave?.(table)}
            disabled={!onSave || isSaving}
            title="Save table to Studio"
            aria-label={isSaving ? "Saving table" : "Save table to Studio"}
            className={TABLE_TOOLBAR_BTN}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2} />
            ) : (
              <Save className="h-4 w-4 shrink-0" strokeWidth={2} />
            )}
            <span className="hidden @min-[860px]/table-toolbar:inline">
              {isSaving ? "Saving..." : "Save table"}
            </span>
          </button>
          <DropdownMenu
            trigger={
              <button
                type="button"
                disabled={exportDisabled}
                title="Export table"
                className={TABLE_TOOLBAR_BTN}
              >
                <Download className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span className="hidden @min-[980px]/table-toolbar:inline">Export</span>
                <ChevronDown
                  className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground @min-[980px]/table-toolbar:inline"
                  strokeWidth={2}
                />
              </button>
            }
          >
            <ExportMenuItem
              icon={<Sheet className="w-4 h-4" />}
              label="CSV (.csv)"
              onClick={handleExportCSV}
            />
            <ExportMenuItem
              icon={<Table2 className="w-4 h-4" />}
              label="Excel (.xlsx)"
              onClick={handleExportExcel}
            />
          </DropdownMenu>
          <button
            type="button"
            onClick={() => {
              setIsFocusMode((focus) => {
                const next = !focus;
                if (next) setShowColumnManager(false);
                return next;
              });
            }}
            className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-foreground transition-colors hover:bg-secondary"
            aria-label={isFocusMode ? "Exit full screen" : "Full screen table"}
            title={isFocusMode ? "Exit full screen" : "Full screen"}
          >
            {isFocusMode ? (
              <Minimize2 className="h-4 w-4 shrink-0" />
            ) : (
              <Maximize2 className="h-4 w-4 shrink-0" />
            )}
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex shrink-0 rounded-md p-1.5 text-foreground transition-colors hover:bg-secondary"
              aria-label="Close table"
              title="Close"
            >
              <X className="h-4 w-4 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            {selectedIds.size} selected
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
              `Add ${selectedIds.size} to notebook`
            )}
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-1 flex-col min-w-0">
          {table.papers.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No papers in this table yet</p>
                <button
                  onClick={onAddPapers}
                  className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Add Papers
                </button>
              </div>
            </div>
          ) : (
            <div className="relative isolate flex-1 min-h-0 overflow-auto bg-background">
              <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className={TABLE_CORNER_HEADER}>
                      <div className="flex h-full items-center gap-3 pl-9">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-border"
                          aria-label="Select all papers"
                        />
                        <span className="text-sm font-medium text-muted-foreground">
                          Papers ({paperCount})
                        </span>
                      </div>
                    </th>
                    {dataColumns.map((col) => (
                      <th key={col.id} className={TABLE_DATA_HEADER}>
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let visibleRank = 0;
                    return table.papers.map((paper, index) => {
                      if (!paper.isIncluded) return null;
                      visibleRank += 1;
                      const inNotebook =
                        paper.citation && existingPapers
                          ? isTablePaperInNotebook(paper.citation, existingPapers)
                          : false;

                      return (
                        <tr key={paper.citationId} className="align-top hover:bg-muted/15">
                          <td className={TABLE_STICKY_BODY_CELL}>
                            <LiteratureTablePaperCell
                              rank={visibleRank}
                              paper={paper}
                              columns={table.columns}
                              isSelected={selectedIds.has(paper.citationId)}
                              isAdding={addingIds.has(paper.citationId)}
                              isInNotebook={inNotebook}
                              onToggleSelect={() => toggleSelect(paper.citationId)}
                              onCite={() => setCiteTarget({ paper, index })}
                              onAddToNotebook={() => void handleAddSingle(paper)}
                            />
                          </td>
                          {dataColumns.map((col) => (
                            <td key={col.id} className={TABLE_DATA_BODY_CELL}>
                              <LiteratureTableExtractionCell value={paper.rowData[col.id] ?? ""} />
                            </td>
                          ))}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {columnManagerOpen && (
          <ColumnManager
            columns={table.columns}
            onChange={handleColumnsChange}
            onSavePreset={handleSavePreset}
            onClose={() => setShowColumnManager(false)}
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
