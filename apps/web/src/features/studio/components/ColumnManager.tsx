import { GripVertical, Plus, X } from "lucide-react";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/utils/cn";
import {
  catalogColumnInTable,
  LITERATURE_TABLE_COLUMN_CATALOG,
} from "../constants/literatureTableColumnCatalog";

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

export const ColumnManager: React.FC<ColumnManagerProps> = ({ columns, onChange, onClose }) => {
  const [customName, setCustomName] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const nameId = useId();
  const instructionsId = useId();
  const headingId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const formWasOpen = useRef(false);

  // The opener is unmounted while the form is open, so hand focus back to it once it returns.
  useEffect(() => {
    if (showCustomForm) formWasOpen.current = true;
    else if (formWasOpen.current) {
      formWasOpen.current = false;
      openerRef.current?.focus();
    }
  }, [showCustomForm]);

  const visibleDataColumns = useMemo(
    () =>
      columns.filter((c) => c.type === "custom" && c.isVisible).sort((a, b) => a.order - b.order),
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

  const cancelCustomForm = () => {
    setShowCustomForm(false);
    setCustomName("");
    setCustomInstructions("");
  };

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
        <Switch
          checked={options.checked}
          onCheckedChange={() => options.onToggle()}
          aria-label={`Toggle ${col.name}`}
        />
        {options.draggable && (
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
        )}
      </div>
    );
  };

  return (
    <aside
      aria-labelledby={headingId}
      className="flex h-full w-88 max-w-full shrink-0 flex-col border-l border-border/50 bg-card shadow-lg"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-5">
        <h3 id={headingId} className="font-sans text-sm font-semibold text-foreground">
          Manage Columns
        </h3>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close column manager"
          >
            <X />
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <p className="mb-3 font-sans text-sm font-medium text-foreground">Create custom column</p>
          {showCustomForm ? (
            <form
              className="rounded-xl bg-muted/40 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                addCustomColumn();
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={nameId}>Column name</FieldLabel>
                  <Input
                    id={nameId}
                    autoFocus
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Sample size"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={instructionsId}>
                    Instructions for extraction (optional)
                  </FieldLabel>
                  <Textarea
                    id={instructionsId}
                    rows={3}
                    className="resize-none"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                  />
                </Field>
              </FieldGroup>
              <div className="mt-3 flex gap-2">
                <Button size="sm" type="submit" className="flex-1" disabled={!customName.trim()}>
                  Add column
                </Button>
                <Button size="sm" type="button" variant="ghost" onClick={cancelCustomForm}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              ref={openerRef}
              variant="outline"
              className="w-full"
              onClick={() => setShowCustomForm(true)}
            >
              <Plus />
              Add Column
            </Button>
          )}
        </section>

        {suggestedRows.length > 0 && (
          <section>
            <h4 className="mb-2 font-sans text-sm font-semibold text-foreground">
              Suggested Columns
            </h4>
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
          <h4 className="mb-2 font-sans text-sm font-semibold text-foreground">Saved Columns</h4>
          <p className="text-sm text-muted-foreground">No saved columns</p>
        </section>

        {(defaultCatalogRows.length > 0 || hiddenTableColumns.length > 0) && (
          <section>
            <h4 className="mb-2 font-sans text-sm font-semibold text-foreground">
              Default Columns
            </h4>
            <div className="max-h-70 space-y-0.5 overflow-y-auto pr-1">
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
    </aside>
  );
};
