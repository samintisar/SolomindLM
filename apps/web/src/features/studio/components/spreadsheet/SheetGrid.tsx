import {
  ArrowDownAZ,
  ArrowDownZA,
  ArrowRightToLine,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type KeyboardEvent,
  memo,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/utils/cn";
import {
  addRow,
  columnCount,
  columnHasData,
  deleteColumn,
  type Grid,
  insertColumn,
  isNumericColumn,
  setCell,
  sortByColumn,
} from "./sheetModel";

/** How long an edited cell keeps its soft green fill before fading back. */
const FLASH_MS = 900;

interface SheetGridProps {
  grid: Grid;
  readOnly: boolean;
  /** Called with the next grid after any edit. The parent owns the grid. */
  onChange: (next: Grid) => void;
  /** Test hook: called each time a body row renders, to prove only changed rows re-render. */
  onRowRender?: (row: number) => void;
}

interface CellPosition {
  row: number;
  col: number;
}

interface CellEdit extends CellPosition {
  draft: string;
  original: string;
}

/**
 * How an edit ended. Enter, Tab and Escape move the selection; a blur leaves it alone, because the
 * click that caused the blur is about to choose a cell itself.
 */
type EditExit = "blur" | "cancel" | "down" | "right" | "left";

/**
 * What happens to focus once a column menu has closed: back to the grid (the default), left alone
 * (a dialog took it, or the user clicked elsewhere), or into a header edit. An edit waits for the
 * close because the open menu traps focus.
 */
type MenuExit = "grid" | "keep" | CellEdit | null;

/** Stable entry points the memoised rows call; they always run the latest render's logic. */
interface SheetActions {
  cellClick: (row: number, col: number) => void;
  cellDoubleClick: (row: number, col: number) => void;
  draftChange: (draft: string) => void;
  editorKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  editorBlur: () => void;
}

const cellKey = (row: number, col: number) => `${row}:${col}`;
const cellId = (prefix: string, row: number, col: number) => `${prefix}-r${row}-c${col}`;

/** The header's text, or the placeholder name an empty header shows. */
function headerLabel(grid: Grid, col: number): string {
  return grid[0]?.[col] || `Column ${col + 1}`;
}

interface CellEditorProps {
  edit: CellEdit;
  label: string;
  numeric: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  actions: SheetActions;
}

/** The in-place editor: a textarea, because cells may hold line breaks. */
function CellEditor({ edit, label, numeric, textareaRef, actions }: CellEditorProps) {
  return (
    <textarea
      ref={textareaRef}
      rows={1}
      aria-label={label}
      value={edit.draft}
      onChange={(event) => actions.draftChange(event.target.value)}
      onKeyDown={actions.editorKeyDown}
      onBlur={actions.editorBlur}
      className={cn(
        "block w-full resize-none rounded-sm bg-card px-3 py-2 shadow-md ring-2 ring-primary ring-inset outline-hidden field-sizing-content",
        numeric && "text-right tabular-nums"
      )}
    />
  );
}

interface SheetRowProps {
  row: number;
  cells: readonly string[];
  idPrefix: string;
  numericColumns: readonly boolean[];
  /** The selected column when the selection is in this row. */
  selectedCol: number | null;
  /** The edit when it is in this row. */
  edit: CellEdit | null;
  /** The editor's accessible name; empty unless this row is being edited. */
  editLabel: string;
  /** Comma-separated columns whose cells are flashing; empty when none. */
  flashCols: string;
  trailingCell: boolean;
  actions: SheetActions;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onRender?: (row: number) => void;
}

/**
 * One body row. Memoised on primitive or stable props, so moving the selection re-renders only the
 * old and new rows and typing re-renders only the row being edited, even at 2,000 × 50 cells.
 */
const SheetRow = memo(function SheetRow({
  row,
  cells,
  idPrefix,
  numericColumns,
  selectedCol,
  edit,
  editLabel,
  flashCols,
  trailingCell,
  actions,
  textareaRef,
  onRender,
}: SheetRowProps) {
  onRender?.(row);
  const flashing = flashCols === "" ? [] : flashCols.split(",").map(Number);
  return (
    <tr role="row">
      <th
        scope="row"
        role="rowheader"
        className="sticky left-0 z-10 border-r border-b border-hairline bg-muted px-2 text-center font-sans text-xs text-muted-foreground tabular-nums"
      >
        {row}
      </th>
      {cells.map((value, col) => {
        const isSelected = selectedCol === col;
        const isEditing = edit !== null && edit.col === col;
        return (
          <td
            // Columns have no identity beyond their position.
            key={col}
            id={cellId(idPrefix, row, col)}
            role="gridcell"
            aria-selected={isSelected}
            data-cell={cellKey(row, col)}
            onClick={() => actions.cellClick(row, col)}
            onDoubleClick={() => actions.cellDoubleClick(row, col)}
            className={cn(
              "border-r border-b border-hairline p-0 align-top transition-colors duration-700 ease-out last:border-r-0",
              flashing.includes(col) && "bg-success-muted"
            )}
          >
            {isEditing ? (
              <CellEditor
                edit={edit}
                label={editLabel}
                numeric={numericColumns[col] ?? false}
                textareaRef={textareaRef}
                actions={actions}
              />
            ) : (
              <div
                className={cn(
                  "min-h-9 max-w-80 min-w-28 px-3 py-2 whitespace-pre-wrap",
                  numericColumns[col] && "text-right tabular-nums",
                  isSelected && "rounded-sm ring-2 ring-primary ring-inset"
                )}
              >
                {value}
              </div>
            )}
          </td>
        );
      })}
      {trailingCell && <td className="border-b border-hairline" />}
    </tr>
  );
});

/**
 * The editable spreadsheet: a sticky header with a menu per column, sticky row numbers, and cells
 * edited in place. It follows the ARIA grid pattern: the grid is one tab stop, the arrows move
 * the selection (announced through `aria-activedescendant`), and Shift+F10 opens the selected
 * column's menu. Keys are handled on the grid element and its editor, never on `window`, so the
 * notebook's hidden second Studio panel never reacts.
 */
export function SheetGrid({ grid, readOnly, onChange, onRowRender }: SheetGridProps) {
  const width = columnCount(grid);
  const lastRow = grid.length - 1;
  const idPrefix = useId();

  const gridRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selected, setSelected] = useState<CellPosition | null>(null);
  const [editing, setEditing] = useState<CellEdit | null>(null);
  // Mirrors `editing` so an edit ends once, whichever of Enter, Tab, Escape or blur gets there first.
  const editingRef = useRef<CellEdit | null>(null);
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(() => new Set());
  const flashTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [menuCol, setMenuCol] = useState<number | null>(null);
  const menuExit = useRef<MenuExit>(null);

  // Keyed by content, so an edit that leaves every column's kind alone keeps the same array and the
  // memoised rows don't all re-render.
  const numericKey = useMemo(
    () =>
      Array.from({ length: columnCount(grid) }, (_, col) =>
        isNumericColumn(grid, col) ? "1" : "0"
      ).join(""),
    [grid]
  );
  const numericColumns = useMemo(() => [...numericKey].map((flag) => flag === "1"), [numericKey]);

  const inBounds = (pos: CellPosition | null) =>
    pos !== null && pos.row <= lastRow && pos.col < width ? pos : null;
  // The parent may shrink the grid (a rollback, a deleted column); ignore positions it no longer has.
  const selection = inBounds(selected);
  const edit = editing !== null && inBounds(editing) !== null ? editing : null;

  const editKey = edit ? cellKey(edit.row, edit.col) : null;
  const focusKey = editKey ?? (selection ? cellKey(selection.row, selection.col) : null);

  useEffect(() => {
    if (focusKey === null) return;
    gridRef.current
      ?.querySelector(`[data-cell="${focusKey}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusKey]);

  // A layout effect, so a tap's focus lands inside the same gesture and phones open the keyboard.
  useLayoutEffect(() => {
    if (editKey === null) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [editKey]);

  useEffect(() => {
    const timers = flashTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });

  const flash = (row: number, col: number) => {
    const key = cellKey(row, col);
    const timers = flashTimers.current;
    clearTimeout(timers.get(key));
    setFlashing((prev) => new Set(prev).add(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        setFlashing((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, FLASH_MS)
    );
  };

  const setEdit = (next: CellEdit | null) => {
    editingRef.current = next;
    setEditing(next);
  };

  /** An edit of one cell; `source` is the grid the cell lives in when the same action changes it. */
  const editOf = (row: number, col: number, draft?: string, source: Grid = grid): CellEdit => {
    const original = source[row]?.[col] ?? "";
    return { row, col, original, draft: draft ?? original };
  };

  const startEdit = (row: number, col: number, draft?: string, source: Grid = grid) => {
    if (!readOnly) setEdit(editOf(row, col, draft, source));
  };

  /** One step right or left in reading order, wrapping across rows; null at either end. */
  const step = (pos: CellPosition, direction: 1 | -1): CellPosition | null => {
    const col = pos.col + direction;
    if (col >= 0 && col < width) return { row: pos.row, col };
    const row = pos.row + direction;
    if (row < 1 || row > lastRow) return null;
    return { row, col: direction === 1 ? 0 : width - 1 };
  };

  const endEdit = (commit: boolean, exit: EditExit) => {
    const current = editingRef.current;
    if (!current) return;
    setEdit(null);
    if (commit && current.draft !== current.original) {
      onChange(setCell(grid, current.row, current.col, current.draft));
      if (current.row > 0) flash(current.row, current.col);
    }
    if (exit === "blur") return;
    let next: CellPosition = { row: current.row, col: current.col };
    if (exit === "down") next = { row: Math.min(current.row + 1, lastRow), col: current.col };
    if (exit === "right" || exit === "left") {
      next = step(current, exit === "right" ? 1 : -1) ?? next;
    }
    // A header edit hands the selection to the first body row; the arrows never reach the header.
    if (next.row === 0) next = { row: 1, col: next.col };
    setSelected(next.row <= lastRow ? next : null);
    focusGrid();
  };

  const handleCellClick = (row: number, col: number) => {
    if (edit && edit.row === row && edit.col === col) return;
    if (!readOnly && selection?.row === row && selection.col === col) {
      startEdit(row, col);
      return;
    }
    setSelected({ row, col });
    focusGrid();
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 229 is the keyCode browsers report for keys an IME is still composing.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      endEdit(true, "down");
    } else if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      endEdit(true, event.shiftKey ? "left" : "right");
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      endEdit(false, "cancel");
    }
  };

  // The rows get stable callbacks that forward to this render's handlers, so they stay memoised.
  const latest = useRef<SheetActions | null>(null);
  useLayoutEffect(() => {
    latest.current = {
      cellClick: handleCellClick,
      cellDoubleClick: (row, col) => {
        if (!(edit && edit.row === row && edit.col === col)) startEdit(row, col);
      },
      draftChange: (draft) => {
        const current = editingRef.current;
        if (current) setEdit({ ...current, draft });
      },
      editorKeyDown: handleEditorKeyDown,
      editorBlur: () => endEdit(true, "blur"),
    };
  });
  const actions = useMemo<SheetActions>(
    () => ({
      cellClick: (row, col) => latest.current?.cellClick(row, col),
      cellDoubleClick: (row, col) => latest.current?.cellDoubleClick(row, col),
      draftChange: (draft) => latest.current?.draftChange(draft),
      editorKeyDown: (event) => latest.current?.editorKeyDown(event),
      editorBlur: () => latest.current?.editorBlur(),
    }),
    []
  );

  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys from the editor, the menus (portalled, but React bubbles through portals) and the buttons
    // are theirs to handle.
    if (event.target !== event.currentTarget || edit) return;
    const { key } = event;
    if (lastRow < 1) return;

    if (!selection) {
      if (key.startsWith("Arrow")) {
        event.preventDefault();
        setSelected({ row: 1, col: 0 });
      }
      return;
    }

    const { row, col } = selection;
    const moveTo = (next: CellPosition) => {
      event.preventDefault();
      setSelected(next);
    };

    switch (key) {
      case "ArrowUp":
        return moveTo({ row: Math.max(1, row - 1), col });
      case "ArrowDown":
        return moveTo({ row: Math.min(lastRow, row + 1), col });
      case "ArrowLeft":
        return moveTo({ row, col: Math.max(0, col - 1) });
      case "ArrowRight":
        return moveTo({ row, col: Math.min(width - 1, col + 1) });
      case "Home":
        return moveTo({ row, col: 0 });
      case "End":
        return moveTo({ row, col: width - 1 });
      case "Tab": {
        // At either end, let focus leave the grid.
        const next = step(selection, event.shiftKey ? -1 : 1);
        if (next) moveTo(next);
        return;
      }
    }

    if (readOnly) return;
    if ((key === "F10" && event.shiftKey) || key === "ContextMenu") {
      event.preventDefault();
      setMenuCol(col);
    } else if (key === "Enter" || key === "F2") {
      event.preventDefault();
      startEdit(row, col);
    } else if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      if (grid[row][col] !== "") {
        onChange(setCell(grid, row, col, ""));
        flash(row, col);
      }
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      startEdit(row, col, key);
    }
  };

  const handleAddRow = () => {
    const next = addRow(grid);
    onChange(next);
    const row = next.length - 1;
    setSelected({ row, col: 0 });
    startEdit(row, 0, undefined, next);
  };

  /** Inserts a column after `afterCol` and returns the edit of its header, which the caller starts. */
  const insertColumnAfter = (afterCol: number): CellEdit => {
    const next = insertColumn(grid, afterCol);
    onChange(next);
    return editOf(0, afterCol + 1, undefined, next);
  };

  const handleSort = (col: number, direction: "asc" | "desc") => {
    onChange(sortByColumn(grid, col, direction));
    if (lastRow >= 1) setSelected({ row: 1, col });
  };

  const removeColumn = (col: number) => {
    onChange(deleteColumn(grid, col));
    if (selection && selection.col >= col) {
      setSelected({ row: selection.row, col: Math.max(0, Math.min(selection.col - 1, width - 2)) });
    }
  };

  const filledCells = (col: number) =>
    grid.slice(1).filter((cells) => (cells[col] ?? "").trim() !== "").length;

  const renderHeader = (col: number) => {
    const text = grid[0][col];
    const label = (
      <span className={cn("truncate", text === "" && "italic")}>{headerLabel(grid, col)}</span>
    );
    if (edit && edit.row === 0 && edit.col === col) {
      return (
        <CellEditor
          edit={edit}
          label={`Rename column ${headerLabel(grid, col)}`}
          numeric={false}
          textareaRef={textareaRef}
          actions={actions}
        />
      );
    }
    if (readOnly) {
      return (
        <span className="flex px-3 py-2 font-sans text-xs font-semibold text-muted-foreground">
          {label}
        </span>
      );
    }
    const numeric = numericColumns[col];
    return (
      <DropdownMenu open={menuCol === col} onOpenChange={(open) => setMenuCol(open ? col : null)}>
        {/* Not a tab stop: the grid is one, and Shift+F10 opens this menu from a selected cell. */}
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            className="flex w-full items-center gap-1.5 px-3 py-2 font-sans text-xs font-semibold text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {label}
            <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          onInteractOutside={() => {
            menuExit.current = "keep";
          }}
          onCloseAutoFocus={(event) => {
            const exit = menuExit.current ?? "grid";
            menuExit.current = null;
            event.preventDefault();
            if (exit === "grid") focusGrid();
            else if (exit !== "keep") setEdit(exit);
          }}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => handleSort(col, "asc")}>
              <ArrowDownAZ />
              {numeric ? "Sort smallest first" : "Sort A → Z"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSort(col, "desc")}>
              <ArrowDownZA />
              {numeric ? "Sort largest first" : "Sort Z → A"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                menuExit.current = insertColumnAfter(col);
              }}
            >
              <ArrowRightToLine />
              Insert column right
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                menuExit.current = editOf(0, col);
              }}
            >
              <Pencil />
              Rename
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              disabled={width <= 1}
              onSelect={() => {
                if (columnHasData(grid, col)) {
                  menuExit.current = "keep";
                  setPendingDelete(col);
                } else {
                  removeColumn(col);
                }
              }}
            >
              <Trash2 />
              Delete column
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const flashByRow = new Map<number, number[]>();
  for (const key of flashing) {
    const [row, col] = key.split(":").map(Number);
    flashByRow.set(row, [...(flashByRow.get(row) ?? []), col]);
  }

  const columns = Array.from({ length: width }, (_, col) => col);
  const deleting = pendingDelete !== null && pendingDelete < width ? pendingDelete : null;
  const deletingCount = deleting === null ? 0 : filledCells(deleting);

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Spreadsheet"
      aria-rowcount={grid.length}
      aria-colcount={width + 1}
      aria-readonly={readOnly || undefined}
      aria-activedescendant={selection ? cellId(idPrefix, selection.row, selection.col) : undefined}
      aria-keyshortcuts={readOnly ? undefined : "Shift+F10"}
      tabIndex={0}
      onKeyDown={handleGridKeyDown}
      className="relative min-h-0 flex-1 overflow-auto rounded-xl bg-card shadow-xs ring-1 ring-hairline outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table role="presentation" className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr role="row">
            <th className="sticky top-0 left-0 z-30 border-r border-b border-hairline bg-muted">
              <span className="sr-only">Row</span>
            </th>
            {columns.map((col) => (
              <th
                key={col}
                role="columnheader"
                data-cell={cellKey(0, col)}
                className="sticky top-0 z-20 border-r border-b border-hairline bg-muted p-0 text-left align-bottom last:border-r-0"
              >
                {renderHeader(col)}
              </th>
            ))}
            {!readOnly && (
              <th className="sticky top-0 z-20 border-b border-hairline bg-muted p-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  tabIndex={-1}
                  aria-label="Add column"
                  onClick={() => setEdit(insertColumnAfter(width - 1))}
                >
                  <Plus />
                </Button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {grid.slice(1).map((cells, index) => {
            const row = index + 1;
            const rowEdit = edit !== null && edit.row === row ? edit : null;
            return (
              // A row has no identity beyond its position, so a sort re-renders rows in place.
              <SheetRow
                key={row}
                row={row}
                cells={cells}
                idPrefix={idPrefix}
                numericColumns={numericColumns}
                selectedCol={selection?.row === row ? selection.col : null}
                edit={rowEdit}
                editLabel={rowEdit ? `Edit ${headerLabel(grid, rowEdit.col)}, row ${row}` : ""}
                flashCols={flashByRow.get(row)?.join(",") ?? ""}
                trailingCell={!readOnly}
                actions={actions}
                textareaRef={textareaRef}
                onRender={onRowRender}
              />
            );
          })}
          {!readOnly && (
            // Not a grid row: aria-rowcount counts the header and the data rows only.
            <tr role="presentation">
              <td colSpan={width + 2} className="p-1">
                <div className="sticky left-1 w-fit">
                  <Button variant="ghost" size="sm" onClick={handleAddRow}>
                    <Plus data-icon="inline-start" />
                    Add row
                  </Button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {!readOnly && (
        <AlertDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <AlertDialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              focusGrid();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete column “{deleting === null ? "" : headerLabel(grid, deleting)}”?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Its {deletingCount} filled {deletingCount === 1 ? "cell" : "cells"} will be removed.
                This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (deleting !== null) removeColumn(deleting);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
