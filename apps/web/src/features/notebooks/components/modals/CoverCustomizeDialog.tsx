import { type FormEvent, useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { useToast } from "@/shared/contexts/useToast";
import {
  COVER_COLORS,
  COVER_ICON_CLASS,
  coverColorLabel,
  coverFillClass,
} from "@/shared/notebook/coverColor";
import {
  COVER_ICONS,
  type CoverIconName,
  FOLDER_ICON_NAMES,
  folderIconName,
  isCoverIconName,
  NOTEBOOK_ICON_NAMES,
  notebookIconName,
} from "@/shared/notebook/notebookIcons";
import { cn } from "@/shared/utils/cn";

interface CoverValues {
  name: string;
  color: string;
  icon: string;
}

const COPY = {
  notebook: {
    create: "Create notebook",
    edit: "Customize notebook",
    label: "Title",
    placeholder: "Notebook title",
  },
  folder: {
    create: "Create folder",
    edit: "Customize folder",
    label: "Name",
    placeholder: "Folder name",
  },
} as const;

interface CoverCustomizeDialogProps {
  kind: "notebook" | "folder";
  /** Omit to create. */
  initial?: CoverValues;
  onClose: () => void;
  onSave: (values: CoverValues) => void | Promise<void>;
}

export function CoverCustomizeDialog({
  kind,
  initial,
  onClose,
  onSave,
}: CoverCustomizeDialogProps) {
  const copy = COPY[kind];
  const isCreate = !initial;
  const iconNames = kind === "notebook" ? NOTEBOOK_ICON_NAMES : FOLDER_ICON_NAMES;
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(coverFillClass(initial?.color));
  const [icon, setIcon] = useState<CoverIconName>(
    kind === "notebook" ? notebookIconName(initial?.icon) : folderIconName(initial?.icon)
  );
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const { error: showError } = useToast();
  const PreviewIcon = COVER_ICONS[icon];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color, icon });
    } catch (error) {
      // Callers handle sign-in and plan-limit errors and rethrow anything else; keep the dialog
      // open so the user can retry.
      showError(error instanceof Error ? error.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-svh overflow-y-auto">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{isCreate ? copy.create : copy.edit}</DialogTitle>
            <DialogDescription>Pick a name, colour and icon.</DialogDescription>
          </DialogHeader>

          <div className="flex justify-center" aria-hidden>
            <div className="flex w-40 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className={cn("flex h-16 items-end p-2.5", color)}>
                <PreviewIcon className={cn("size-7", COVER_ICON_CLASS)} />
              </div>
              <div className="truncate p-2.5 text-sm font-semibold text-card-foreground">
                {name.trim() || copy.placeholder}
              </div>
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor={nameId}>{copy.label}</FieldLabel>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={copy.placeholder}
              autoFocus
            />
          </Field>

          <FieldSet>
            <FieldLegend variant="label">Colour</FieldLegend>
            <ToggleGroup
              type="single"
              variant="swatch"
              size="sm"
              spacing={1}
              value={color}
              onValueChange={(value) => value && setColor(value)}
              className="flex-wrap"
            >
              {COVER_COLORS.map((swatch) => (
                <ToggleGroupItem key={swatch} value={swatch} aria-label={coverColorLabel(swatch)}>
                  <span aria-hidden className={cn("size-full rounded-full", swatch)} />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">Icon</FieldLegend>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={1}
              value={icon}
              onValueChange={(value) => isCoverIconName(value) && setIcon(value)}
              className="flex-wrap"
            >
              {iconNames.map((iconName) => {
                const Icon = COVER_ICONS[iconName];
                return (
                  <ToggleGroupItem key={iconName} value={iconName} aria-label={`${iconName} icon`}>
                    <Icon />
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </FieldSet>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {isCreate ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
