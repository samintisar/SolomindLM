import {
  BarChart3,
  Book,
  Brain,
  FileText,
  Folder,
  Globe,
  GraduationCap,
  Lightbulb,
  Monitor,
  MoreVertical,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import React from "react";
import { COVER_ICON_CLASS, coverFillClass } from "@/shared/notebook/coverColor";
import { FolderItem } from "@/shared/types/index";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";

const IconMap: Record<string, React.FC<any>> = {
  Folder,
  Book,
  BarChart: BarChart3,
  Monitor,
  Search,
  Brain,
  Globe,
  FileText,
  GraduationCap,
  Lightbulb,
};

function formatNotebookCount(count: number): string {
  return `${count} ${count === 1 ? "notebook" : "notebooks"}`;
}

interface FolderCardProps {
  folder: FolderItem;
  viewMode: "grid" | "list";
  isMenuOpen: boolean;
  isExpanded?: boolean; // Optional now since we're not using expansion
  onSelectFolder: () => void;
  onOpenFolderCustomize: () => void;
  onDeleteFolder: (id: string) => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
}

export const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  viewMode,
  isMenuOpen,
  isExpanded = false, // Default to false since we're not using expansion
  onSelectFolder,
  onOpenFolderCustomize,
  onDeleteFolder,
  onToggleMenu,
  onCloseMenu,
}) => {
  const FolderIcon = (folder.icon && IconMap[folder.icon]) || Folder;
  const fill = coverFillClass(folder.color);
  const notebookCountLabel = formatNotebookCount(folder.notebookCount);
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const handleDeleteWithConfirmation = async () => {
    const confirmed = await confirm(
      "Delete Folder",
      `Are you sure you want to delete "${folder.name}"? This will also remove all notebooks inside this folder.`,
      { confirmText: "Delete", cancelText: "Cancel", variant: "danger" }
    );
    if (confirmed) {
      onDeleteFolder(folder.id);
    }
  };

  if (viewMode === "grid") {
    return (
      <>
        <div
          onClick={() => onSelectFolder()}
          className={`group relative aspect-16/10 flex flex-col cursor-pointer transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${isExpanded ? "ring-2 ring-primary/50 rounded-2xl" : ""}`}
        >
          {/* Folder silhouette: a tab on the left and sheets peeking out on the right */}
          <div aria-hidden="true" className="relative h-3.5 shrink-0">
            <div
              className={`absolute inset-y-0 left-0 w-[42%] -mb-px rounded-t-xl border border-b-0 border-border ${fill} brightness-90`}
            />
            <div className="absolute bottom-0 left-[46%] right-6 h-2.5 rounded-t-md border border-b-0 border-border bg-muted" />
            <div className="absolute bottom-0 left-[50%] right-10 h-1.5 rounded-t-md border border-b-0 border-border bg-card" />
          </div>

          <div className="relative flex-1 min-h-0 flex flex-col rounded-2xl rounded-tl-none bg-card border border-border shadow-sm ring-1 ring-border/50 transition-shadow duration-300 group-hover:shadow-xl">
            {/* Top Decorative Half */}
            <div
              className={`h-[55%] ${fill} transition-colors p-5 relative flex items-start justify-between rounded-tr-2xl`}
            >
              <FolderIcon
                aria-hidden="true"
                className={`w-10 h-10 ${COVER_ICON_CLASS} group-hover:scale-110 transition-transform duration-300 drop-shadow-sm`}
              />

              <div className="relative folder-kebab-menu z-20" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  aria-label={`Folder options for ${folder.name}`}
                  onClick={() => (isMenuOpen ? onCloseMenu() : onToggleMenu())}
                  className="p-1.5 -mr-1.5 -mt-1.5 hover:bg-black/10 rounded-xl text-muted-foreground/70 hover:text-foreground transition-colors opacity-100"
                >
                  <MoreVertical aria-hidden="true" className="w-4 h-4" />
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-md z-30 py-1 animate-in fade-in zoom-in-95 duration-150">
                    <button
                      onClick={onOpenFolderCustomize}
                      className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                    >
                      <Settings2 className="w-3.5 h-3.5" /> Customize
                    </button>
                    <button
                      onClick={() => {
                        handleDeleteWithConfirmation();
                        onCloseMenu();
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Info Half */}
            <div className="h-[45%] px-5 py-4 flex flex-col justify-end gap-1 bg-card relative rounded-b-2xl">
              <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-border to-transparent opacity-50" />

              <h3 className="text-base font-bold text-foreground leading-snug line-clamp-1 font-sans min-w-0">
                {folder.name}
              </h3>
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Folder aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                <span className="tabular-nums">{notebookCountLabel}</span>
              </p>
            </div>
          </div>
        </div>
        <ConfirmDialogComponent />
      </>
    );
  }

  // List view
  return (
    <>
      <div className="relative">
        <div
          className={`group grid grid-cols-[minmax(200px,1fr)_100px_48px] items-center gap-4 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-md cursor-pointer transition-all relative`}
        >
          <div onClick={() => onSelectFolder()} className="absolute inset-0 z-0 rounded-xl" />

          {/* Title Column */}
          <div className="flex items-center gap-3 min-w-0 z-10 pointer-events-none">
            {/* Folder-shaped tile: tab on the left, sheet peeking out on the right */}
            <div aria-hidden="true" className="relative w-9 h-9 shrink-0">
              <div
                className={`absolute -top-1.5 left-0 h-2 w-1/2 rounded-t-sm ${fill} brightness-90`}
              />
              <div className="absolute -top-1 left-[56%] right-1 h-1.5 rounded-t-sm border border-b-0 border-border bg-card" />
              <div
                className={`absolute inset-0 rounded-md rounded-tl-none ${fill} flex items-center justify-center`}
              >
                <FolderIcon className={`w-4 h-4 ${COVER_ICON_CLASS}`} />
              </div>
            </div>

            <div className="min-w-0">
              <span className="font-bold text-foreground font-serif group-hover:text-primary transition-colors truncate block">
                {folder.name}
              </span>
              <span className="text-xs text-muted-foreground">Folder</span>
            </div>
          </div>

          {/* Notebook Count Column */}
          <div className="text-right z-10 pointer-events-none flex items-center justify-end gap-1.5">
            <Folder aria-hidden="true" className="w-3 h-3 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium tabular-nums whitespace-nowrap">
              {notebookCountLabel}
            </span>
          </div>

          {/* Action Column */}
          <div className="flex justify-end z-20 pointer-events-auto folder-kebab-menu relative">
            <button
              type="button"
              aria-label={`Folder options for ${folder.name}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isMenuOpen) onCloseMenu();
                else onToggleMenu();
              }}
              className={`p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center shrink-0 opacity-100 ${isMenuOpen ? "bg-secondary" : ""}`}
            >
              <MoreVertical aria-hidden="true" className="w-4 h-4 shrink-0" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-lg z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenFolderCustomize();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5 shrink-0" /> Customize
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteWithConfirmation();
                    onCloseMenu();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialogComponent />
    </>
  );
};
