import { Settings2, Trash2 } from "lucide-react";
import { Card } from "@/shared/components/ui/card";
import { COVER_ICON_CLASS, coverFillClass } from "@/shared/notebook/coverColor";
import { folderIcon } from "@/shared/notebook/notebookIcons";
import type { FolderItem } from "@/shared/types/index";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { cn } from "@/shared/utils/cn";
import { folderMeta } from "../../notebookMeta";
import { CardActionsMenu } from "./CardActionsMenu";
import { CARD_OPEN_BUTTON_CLASS } from "./cardClasses";

interface FolderCardProps {
  folder: FolderItem;
  viewMode: "grid" | "list";
  onSelectFolder: () => void;
  onOpenFolderCustomize: () => void;
  onDeleteFolder: (id: string) => void;
}

export function FolderCard({
  folder,
  viewMode,
  onSelectFolder,
  onOpenFolderCustomize,
  onDeleteFolder,
}: FolderCardProps) {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const Icon = folderIcon(folder.icon);
  const fill = coverFillClass(folder.color);
  const meta = folderMeta(folder);
  const menu = (
    <CardActionsMenu
      label="Folder actions"
      actions={[
        { label: "Customize", icon: Settings2, onSelect: onOpenFolderCustomize },
        {
          label: "Delete",
          icon: Trash2,
          destructive: true,
          onSelect: async () => {
            const ok = await confirm(
              "Delete Folder",
              `Are you sure you want to delete "${folder.name}"? This will also remove all notebooks inside this folder.`,
              { confirmText: "Delete", cancelText: "Cancel", variant: "danger" }
            );
            if (ok) onDeleteFolder(folder.id);
          },
        },
      ]}
    />
  );

  if (viewMode === "list") {
    return (
      <>
        <Card variant="interactive" className="flex-row items-center">
          <button
            type="button"
            onClick={onSelectFolder}
            className={cn(
              CARD_OPEN_BUTTON_CLASS,
              "flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
            )}
          >
            {/* Icon chip with a folder tab */}
            <span className="relative flex size-9 shrink-0 items-center justify-center">
              <span
                aria-hidden
                className={cn("absolute -top-1 left-0.5 h-1.5 w-4 rounded-t-sm", fill)}
              />
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-md rounded-tl-none",
                  fill
                )}
              >
                <Icon aria-hidden className={cn("size-4", COVER_ICON_CLASS)} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-card-foreground">
                {folder.name}
              </span>
              <span className="block text-xs text-muted-foreground sm:hidden">{meta}</span>
            </span>
            <span className="hidden w-40 shrink-0 text-right text-xs text-muted-foreground sm:block">
              {meta}
            </span>
          </button>
          <div className="mr-2 flex w-8 shrink-0 justify-center">{menu}</div>
        </Card>
        <ConfirmDialogComponent />
      </>
    );
  }

  return (
    <>
      <div className="relative h-full">
        {/* Folder silhouette: a tab above the top-left edge and a sheet peeking out underneath. */}
        <span
          aria-hidden
          className={cn("absolute -top-2 left-4 h-3 w-14 rounded-t-md opacity-60", fill)}
        />
        <span
          aria-hidden
          className="absolute inset-x-2 -bottom-1.5 top-3 rounded-xl border border-border bg-card shadow-sm"
        />
        <Card variant="interactive" className="h-full">
          <button
            type="button"
            onClick={onSelectFolder}
            className={cn(CARD_OPEN_BUTTON_CLASS, "flex h-full flex-col text-left")}
          >
            <span className="relative flex h-16 w-full items-end p-3 sm:h-24 sm:p-4">
              <span aria-hidden className={cn("absolute inset-0 opacity-60", fill)} />
              <Icon aria-hidden className={cn("relative size-6 sm:size-8", COVER_ICON_CLASS)} />
            </span>
            <span className="flex flex-1 flex-col gap-1 p-3 sm:gap-1.5 sm:p-4">
              <span className="line-clamp-2 text-base font-semibold leading-snug text-card-foreground">
                {folder.name}
              </span>
              <span className="text-xs text-muted-foreground">{meta}</span>
            </span>
          </button>
          <div className="absolute top-2 right-2">{menu}</div>
        </Card>
      </div>
      <ConfirmDialogComponent />
    </>
  );
}
