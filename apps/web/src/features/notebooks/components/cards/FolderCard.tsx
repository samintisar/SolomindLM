import React from "react";
import {
  MoreVertical,
  Settings2,
  Trash2,
  Folder,
  Book,
  BarChart3,
  Monitor,
  Search,
  Brain,
  Globe,
  FileText,
  GraduationCap,
  Lightbulb,
} from "lucide-react";
import { FolderItem } from "@/shared/types/index";
import { useConfirmDialog } from "@/shared/ui/ConfirmDialog";

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
  const FolderIcon = folder.icon ? IconMap[folder.icon] : Folder;
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
        <div className="relative">
          {/* Folder Card */}
          <div
            className={`group relative aspect-16/10 rounded-2xl bg-card border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col ring-1 ring-border/50 ${isExpanded ? "ring-2 ring-primary/50" : ""}`}
          >
            {/* Top Decorative Half */}
            <div
              onClick={() => onSelectFolder()}
              className={`h-[55%] ${folder.color || "bg-blue-500"} bg-opacity-[4%] group-hover:bg-opacity-[6%] transition-colors p-5 relative flex items-start justify-between rounded-t-2xl`}
            >
              <FolderIcon
                className={`w-10 h-10 ${(folder.color || "").replace("bg-", "text-")} opacity-55 group-hover:scale-110 transition-transform duration-300 drop-shadow-sm`}
              />

              <div className="relative folder-kebab-menu z-20" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => (isMenuOpen ? onCloseMenu() : onToggleMenu())}
                  className="p-1.5 -mr-1.5 -mt-1.5 hover:bg-black/10 rounded-xl text-muted-foreground/70 hover:text-foreground transition-colors opacity-100"
                >
                  <MoreVertical className="w-4 h-4" />
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
            <div
              onClick={() => onSelectFolder()}
              className="h-[45%] p-5 flex flex-col justify-end bg-card relative rounded-b-2xl"
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-border to-transparent opacity-50" />

              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-foreground leading-snug line-clamp-2 font-sans">
                  {folder.name}
                </h3>

                <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium uppercase tracking-wider shrink-0">
                  <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-0.5 rounded-xl">
                    <Folder className="w-3 h-3" />
                    <span>{folder.notebookCount}</span>
                  </div>
                </div>
              </div>
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
            <div
              className={`w-9 h-9 rounded-md ${folder.color || "bg-blue-500"} bg-opacity-[3%] flex items-center justify-center shrink-0`}
            >
              <FolderIcon
                className={`w-4 h-4 ${(folder.color || "").replace("bg-", "text-")} opacity-50`}
              />
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
            <div className="inline-flex items-center gap-1.5">
              <Folder className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">
                {folder.notebookCount}
              </span>
            </div>
          </div>

          {/* Action Column */}
          <div className="flex justify-end z-20 pointer-events-auto folder-kebab-menu relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isMenuOpen) onCloseMenu();
                else onToggleMenu();
              }}
              className={`p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center shrink-0 opacity-100 ${isMenuOpen ? "bg-secondary" : ""}`}
            >
              <MoreVertical className="w-4 h-4 shrink-0" />
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
