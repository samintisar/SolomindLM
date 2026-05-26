import React, { useCallback, useMemo, useState } from "react";
import { X, Plus, GripVertical } from "lucide-react";
import { LITERATURE_TABLE_COLUMN_CATALOG, catalogColumnInTable } from "../constants/literatureTableColumnCatalog";

export interface TableColumn {
  id: string;
  name: string;
  type: "paper_title" | "authors" | "year" | "study_type" | "custom";
  instructions?: string;
  isVisible: boolean;
  isSystem: boolean;
  order: number;
}

interface ColumnManagerProps {
  columns: TableColumn[];
  onChange: (columns: TableColumn[]) => void;
  suggestedColumns?: TableColumn[];
  onSavePreset?: (name: string, columns: TableColumn[]) => void;
  onClose?: () => void;
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function ColumnToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-emerald-500" : "bg-muted-foreground/25"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export const ColumnManager: React.FC<ColumnManagerProps> = ({
  columns,
  onChange,
  onClose,
}) => {
  const [customName, setCustomName] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const visibleDataColumns = useMemo(
    () =>
      columns
        .filter((c) => c.type === "custom" && c.isVisible)
        .sort((a, b) => a.order - b.order),
    [columns]
  );

  const suggestedRows = useMemo(() => visibleDataColumns, [visibleDataColumns]);

  const defaultCatalogRows = useMemo(() => {
    const inTableNames = new Set(columns.map((c) => c.name.toLowerCase()));
    return LITERATURE_TABLE_COLUMN_CATALOG.filter(
      (entry) =>
        !columns.some((c) => c.id === entry.id) && !inTableNames.has(entry.name.toLowerCase())
    );
  }, [columns]);

  const hiddenTableColumns = useMemo(
    () =>
      columns.filter(
        (c) =>
          c.type === "custom" &&
          !c.isVisible &&
          !defaultCatalogRows.some((d) => d.id === c.id || d.name === c.name)
      ),
    [columns, defaultCatalogRows]
  );

  const toggleColumnVisibility = useCallback(
    (id: string) => {
      onChange(columns.map((c) => (c.id === id ? { ...c, isVisible: !c.isVisible } : c)));
    },
    [columns, onChange]
  );

  const enableCatalogColumn = useCallback(
    (catalogEntry: (typeof LITERATURE_TABLE_COLUMN_CATALOG)[number]) => {
      const existing = catalogColumnInTable(catalogEntry.id, columns);
      if (existing) {
        toggleColumnVisibility(existing.id);
        return;
      }
      const maxOrder = Math.max(0, ...columns.map((c) => c.order));
      const newColumn: TableColumn = {
        ...catalogEntry,
        isVisible: true,
        order: maxOrder + 1,
      };
      onChange([...columns, newColumn]);
    },
    [columns, onChange, toggleColumnVisibility]
  );

  const addCustomColumn = () => {
    if (!customName.trim()) return;
    const maxOrder = Math.max(0, ...columns.map((c) => c.order));
    const newColumn: TableColumn = {
      id: `col_${Math.random().toString(36).slice(2, 9)}`,
      name: customName.trim(),
      type: "custom",
      instructions: customInstructions.trim() || undefined,
      isVisible: true,
      isSystem: false,
      order: maxOrder + 1,
    };
    onChange([...columns, newColumn]);
    setCustomName("");
    setCustomInstructions("");
    setShowCustomForm(false);
  };

  const handleDragStart = (id: string) => setDraggedId(id);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (!draggedId || draggedId === targetId) return;

      const draggedCol = columns.find((c) => c.id === draggedId);
      if (!draggedCol) return;

      const visibleCols = columns
        .filter((c) => c.type === "custom" && c.isVisible)
        .sort((a, b) => a.order - b.order);
      const draggedIdx = visibleCols.findIndex((c) => c.id === draggedId);
      const targetIdx = visibleCols.findIndex((c) => c.id === targetId);
      if (draggedIdx === -1 || targetIdx === -1) return;

      const newCols = [...visibleCols];
      newCols.splice(draggedIdx, 1);
      newCols.splice(targetIdx, 0, draggedCol);
      const reordered = newCols.map((c, i) => ({ ...c, order: i + 1 }));
      const otherCols = columns.filter((c) => c.type !== "custom" || !c.isVisible);
      onChange([...reordered, ...otherCols]);
    },
    [draggedId, columns, onChange]
  );

  const handleDragEnd = () => setDraggedId(null);

  const renderColumnRow = (
    col: { id: string; name: string; isVisible?: boolean },
    options: { draggable?: boolean; checked: boolean; onToggle: () => void }
  ) => {
    const existing = columns.find((c) => c.id === col.id || c.name === col.name);
    const rowId = existing?.id ?? col.id;
    return (
      <div
        key={rowId}
        draggable={options.draggable}
        onDragStart={() => existing && handleDragStart(existing.id)}
        onDragOver={(e) => existing && handleDragOver(e, existing.id)}
        onDragEnd={handleDragEnd}
        className={cn(
          "flex items-center gap-3 rounded-lg px-1 py-2.5",
          draggedId === existing?.id && "opacity-50",
          options.draggable && "cursor-grab active:cursor-grabbing"
        )}
      >
        <span className="min-w-0 flex-1 text-sm text-foreground">{col.name}</span>
        <ColumnToggle checked={options.checked} onChange={options.onToggle} label={`Toggle ${col.name}`} />
        {options.draggable && (
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-[min(100%,22rem)] shrink-0 flex-col border-l border-border bg-card shadow-[-4px_0_24px_rgba(0,0,0,0.04)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <h3 className="text-sm font-semibold text-foreground">Manage Columns</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close column manager"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <p className="mb-3 text-sm font-medium text-foreground">Create custom column</p>
          {showCustomForm ? (
            <div className="space-y-3 rounded-xl border border-border bg-background p-4">
              <input
                type="text"
                placeholder="Column name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <textarea
                placeholder="Instructions for extraction (optional)"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addCustomColumn}
                  className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Add column
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomForm(false);
                    setCustomName("");
                    setCustomInstructions("");
                  }}
                  className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
            >
              <Plus className="h-4 w-4" />
              Add Column
            </button>
          )}
        </section>

        {suggestedRows.length > 0 && (
          <section>
            <h4 className="mb-2 text-sm font-semibold text-foreground">Suggested Columns</h4>
            <div className="space-y-0.5">
              {suggestedRows.map((col) => {
                const existing = columns.find((c) => c.id === col.id || c.name === col.name);
                const isActive = existing?.isVisible ?? col.isVisible;
                return renderColumnRow(col, {
                  draggable: Boolean(existing?.isVisible),
                  checked: isActive,
                  onToggle: () => {
                    if (existing) toggleColumnVisibility(existing.id);
                    else
                      enableCatalogColumn({
                        id: col.id,
                        name: col.name,
                        type: "custom",
                        instructions: col.instructions,
                        isSystem: false,
                      });
                  },
                });
              })}
            </div>
          </section>
        )}

        <section>
          <h4 className="mb-2 text-sm font-semibold text-foreground">Saved Columns</h4>
          <p className="text-sm text-muted-foreground">No saved columns</p>
        </section>

        {(defaultCatalogRows.length > 0 || hiddenTableColumns.length > 0) && (
          <section>
            <h4 className="mb-2 text-sm font-semibold text-foreground">Default Columns</h4>
            <div className="max-h-[280px] space-y-0.5 overflow-y-auto pr-1">
              {hiddenTableColumns.map((col) =>
                renderColumnRow(col, {
                  draggable: false,
                  checked: false,
                  onToggle: () => toggleColumnVisibility(col.id),
                })
              )}
              {defaultCatalogRows.map((entry) =>
                renderColumnRow(
                  { id: entry.id, name: entry.name, isVisible: false },
                  {
                    draggable: false,
                    checked: false,
                    onToggle: () => enableCatalogColumn(entry),
                  }
                )
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
