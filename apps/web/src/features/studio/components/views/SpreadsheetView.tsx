import { ArrowLeft, Download, Table2, XCircle } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import type { SpreadsheetNote } from "@/shared/types/index";
import { useSaveSpreadsheetData } from "../../services/spreadsheetsApi";
import { SheetGrid } from "../spreadsheet/SheetGrid";
import { SheetSaveStatus } from "../spreadsheet/SheetSaveStatus";
import { type Grid, toCsv, toGrid } from "../spreadsheet/sheetModel";
import { useSheetAutosave } from "../spreadsheet/useSheetAutosave";

export interface SpreadsheetViewProps {
  note: SpreadsheetNote;
  onBack?: () => void;
}

/** A download name without the characters file systems reject. */
function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "-").trim() || "spreadsheet";
}

/** Saves the CSV as a file, with a BOM so Excel reads it as UTF-8. */
function downloadCsv(csv: string, title: string) {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(title)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    return (error as { message?: string }).message || "An unknown error occurred";
  }
  return typeof error === "string" && error ? error : "An unknown error occurred";
}

/**
 * Whether the note holds a sheet, decided from its saved content alone: any CSV text except
 * blank and the `{}` a generating row starts with. Blank headers or cells don't count against
 * it, since an edit can clear them and the sheet must stay reachable to fill them in again.
 */
function hasTableContent(content: unknown): boolean {
  if (typeof content !== "string") return false;
  const trimmed = content.trim();
  return trimmed !== "" && trimmed !== "{}";
}

/**
 * A generated spreadsheet as an always-editable sheet that autosaves. It is read-only until the
 * spreadsheet is completed, so an edit can't race the job that writes it.
 *
 * Keyed by note id, so a different spreadsheet never inherits this one's grid or pending save.
 */
export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({ note, onBack }) => (
  <SpreadsheetSheet key={note.id} note={note} onBack={onBack} />
);

function SpreadsheetSheet({ note, onBack }: SpreadsheetViewProps) {
  const readOnly = note.status !== "completed";
  const isFailed = note.status === "failed";

  const [grid, setGrid] = useState<Grid>(() => toGrid(note.content));
  const csv = useMemo(() => toCsv(grid), [grid]);
  // The server's CSV as this sheet would write it. Generated CSV is fully quoted; comparing the
  // re-serialized form means opening (or adopting) it is not mistaken for an edit and saved.
  const serverCsv = useMemo(() => toCsv(toGrid(note.content)), [note.content]);
  /**
   * The last CSV this view loaded, adopted or saved. A server change is adopted only while the
   * grid still shows it, i.e. holds no unsaved edit. (`note.content` itself can't be the baseline:
   * the optimistic update makes it equal to an edit before the save lands.)
   */
  const syncedCsvRef = useRef(serverCsv);

  const saveData = useSaveSpreadsheetData();
  const { showError } = useServiceErrorToast();

  const save = useCallback(
    async (data: string) => {
      const result = await saveData(note.id, data);
      syncedCsvRef.current = data;
      return result;
    },
    [saveData, note.id]
  );

  const onRejected = useCallback(
    (lastGoodCsv: string, error: unknown) => {
      syncedCsvRef.current = lastGoodCsv;
      setGrid(toGrid(lastGoodCsv));
      showError(error);
    },
    [showError]
  );

  const { state, retry } = useSheetAutosave({
    csv,
    serverCsv,
    save,
    onRejected,
    enabled: !readOnly,
  });

  // A regenerate, or a save from the notebook's other (hidden) Studio panel, arrives as new
  // content. Adopt it unless this sheet holds an edit the server hasn't confirmed yet.
  const adoptServerContent = useEffectEvent((content: string, normalized: string) => {
    if (state === "saving" || csv !== syncedCsvRef.current) return;
    syncedCsvRef.current = normalized;
    if (normalized !== csv) setGrid(toGrid(content));
  });
  useEffect(() => {
    adoptServerContent(note.content, serverCsv);
  }, [note.content, serverCsv]);

  const hasTable = hasTableContent(note.content);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background animate-in fade-in slide-in-from-right-4 duration-300 ease-out">
      {onBack && (
        <div className="sticky top-0 z-20 flex items-center gap-2 bg-background px-2 py-2 md:hidden">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
          <span className="truncate text-sm font-semibold">{note.title}</span>
        </div>
      )}

      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <h2
          className={
            onBack
              ? "hidden flex-1 truncate font-display text-base font-semibold md:block"
              : "flex-1 truncate font-display text-base font-semibold"
          }
        >
          {note.title}
        </h2>
        <SheetSaveStatus state={state} editedAt={note.metadata?.editedAt} onRetry={retry} />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Download CSV"
          disabled={!hasTable}
          onClick={() => downloadCsv(csv, note.title)}
        >
          <Download />
        </Button>
      </div>

      {isFailed && (
        <div className="px-4 pb-3">
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Spreadsheet generation failed</AlertTitle>
            <AlertDescription>{errorMessage(note.metadata?.error)}</AlertDescription>
          </Alert>
        </div>
      )}

      {hasTable ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          <SheetGrid grid={grid} readOnly={readOnly} onChange={setGrid} />
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{isFailed ? <XCircle /> : <Table2 />}</EmptyMedia>
            <EmptyTitle>
              {isFailed ? "Spreadsheet generation failed" : "No data to display"}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {hasTable && !readOnly && (
        <p className="hidden px-4 pb-3 font-sans text-xs text-muted-foreground md:block">
          Click a cell, then type to edit · Enter, Tab and the arrow keys move · Esc cancels
        </p>
      )}
    </div>
  );
}
