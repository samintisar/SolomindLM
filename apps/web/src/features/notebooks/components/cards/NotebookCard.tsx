import React from "react";
import {
  MoreVertical,
  Settings2,
  Trash2,
  FolderOpen,
  FileText,
  Book,
  Globe,
  BarChart3,
  Monitor,
  Search,
  Brain,
  Folder,
  GraduationCap,
  Lightbulb,
  Users,
} from "lucide-react";
import { NotebookItem } from "@/shared/types/index";
import { useConfirmDialog } from "@/shared/ui/ConfirmDialog";

const IconMap: Record<string, React.FC<{ className?: string }>> = {
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

/** Shared props for all notebook card variants */
interface SharedNotebookCardProps {
  notebook: NotebookItem;
  isMenuOpen: boolean;
  onSelectNotebook: (notebook: NotebookItem) => void;
  onOpenCustomize: () => void;
  onOpenMoveToFolder: () => void;
  onDeleteNotebook: (id: string) => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
}

/** Shared context used by the kebab menu in every variant */
function useNotebookCardActions({
  notebook,
  isMenuOpen,
  onDeleteNotebook,
  onOpenCustomize,
  onOpenMoveToFolder,
  onCloseMenu,
  onToggleMenu,
}: SharedNotebookCardProps) {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const handleDeleteWithConfirmation = async () => {
    const confirmed = await confirm(
      "Delete Notebook",
      `Are you sure you want to delete "${notebook.title}"? This action cannot be undone.`,
      { confirmText: "Delete", cancelText: "Cancel", variant: "danger" }
    );
    if (confirmed) {
      onDeleteNotebook(notebook.id);
    }
  };

  return {
    isMenuOpen,
    onOpenCustomize,
    onOpenMoveToFolder,
    onCloseMenu,
    onToggleMenu,
    handleDeleteWithConfirmation,
    ConfirmDialogComponent,
  };
}

/** Kebab dropdown menu — shared across all variants */
function NotebookMenuDropdown({
  onOpenCustomize,
  onOpenMoveToFolder,
  onDelete,
  onCloseMenu,
}: {
  onOpenCustomize: () => void;
  onOpenMoveToFolder: () => void;
  onDelete: () => void;
  onCloseMenu: () => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-md z-30 py-1 animate-in fade-in zoom-in-95 duration-150">
      <button
        onClick={onOpenCustomize}
        className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
      >
        <Settings2 className="w-3.5 h-3.5" /> Customize
      </button>
      <button
        onClick={onOpenMoveToFolder}
        className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
      >
        <FolderOpen className="w-3.5 h-3.5" /> Move to folder
      </button>
      <button
        onClick={() => {
          onDelete();
          onCloseMenu();
        }}
        className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2"
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>
    </div>
  );
}

/** Shared badge for shared notebooks */
function SharedBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const sizeClasses = size === "sm"
    ? "gap-0.5 px-2 py-0.5 text-[9px]"
    : "gap-1 px-2 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-xl bg-primary/10 font-semibold uppercase tracking-wide text-primary ${sizeClasses}`}
      title="Shared with you"
    >
      <Users className={size === "sm" ? "w-3 h-3 shrink-0" : "w-3.5 h-3.5"} />
      Shared
    </span>
  );
}

// ─── Grid Variant ──────────────────────────────────────────────────────────────

export function NotebookCardGrid(props: SharedNotebookCardProps) {
  const { notebook, onSelectNotebook } = props;
  const {
    isMenuOpen,
    onOpenCustomize,
    onOpenMoveToFolder,
    onCloseMenu,
    onToggleMenu,
    handleDeleteWithConfirmation,
    ConfirmDialogComponent,
  } = useNotebookCardActions(props);

  const Icon = notebook.icon ? IconMap[notebook.icon] : Folder;

  return (
    <>
      <div className="group relative aspect-16/10 rounded-2xl bg-card border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col ring-1 ring-border/50">
        {/* Top Decorative Half */}
        <div
          onClick={() => onSelectNotebook(notebook)}
          className={`h-[55%] ${notebook.coverColor} bg-opacity-[4%] group-hover:bg-opacity-[6%] transition-colors p-5 relative flex items-start justify-between rounded-t-2xl`}
        >
          <Icon
            className={`w-10 h-10 ${(notebook.coverColor || "").replace("bg-", "text-")} opacity-55 group-hover:scale-110 transition-transform duration-300 drop-shadow-sm`}
          />

          {!notebook.isSharedNotebook ? (
            <div className="relative kebab-menu z-20" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => (isMenuOpen ? onCloseMenu() : onToggleMenu())}
                className="p-1.5 -mr-1.5 -mt-1.5 hover:bg-black/10 rounded-xl text-muted-foreground/70 hover:text-foreground transition-colors opacity-100"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {isMenuOpen && (
                <NotebookMenuDropdown
                  onOpenCustomize={onOpenCustomize}
                  onOpenMoveToFolder={onOpenMoveToFolder}
                  onDelete={handleDeleteWithConfirmation}
                  onCloseMenu={onCloseMenu}
                />
              )}
            </div>
          ) : (
            <SharedBadge size="md" />
          )}
        </div>

        {/* Bottom Info Half */}
        <div
          onClick={() => onSelectNotebook(notebook)}
          className="h-[45%] p-5 flex flex-col justify-end bg-card relative rounded-b-2xl"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-border to-transparent opacity-50" />
          <div className="flex items-end justify-between gap-2">
            <h3 className="text-base font-bold text-foreground leading-snug line-clamp-2 font-sans flex-1 min-w-0">
              {notebook.title}
            </h3>
            <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-0.5 rounded-xl text-sm text-muted-foreground font-medium uppercase tracking-wider shrink-0">
              <FileText className="w-3 h-3" />
              <span>{notebook.sourceCount}</span>
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialogComponent />
    </>
  );
}

// ─── List-in-Folder Variant ────────────────────────────────────────────────────

export function NotebookCardListInFolder(props: SharedNotebookCardProps) {
  const { notebook, onSelectNotebook } = props;
  const {
    isMenuOpen,
    onOpenCustomize,
    onOpenMoveToFolder,
    onCloseMenu,
    onToggleMenu,
    handleDeleteWithConfirmation,
    ConfirmDialogComponent,
  } = useNotebookCardActions(props);

  const Icon = notebook.icon ? IconMap[notebook.icon] : Folder;

  return (
    <>
      <div className="group flex items-center justify-between gap-2 bg-card border border-border/50 hover:border-primary/30 hover:shadow-sm cursor-pointer transition-all relative p-2.5 rounded-lg">
        <div
          onClick={() => onSelectNotebook(notebook)}
          className="absolute inset-0 z-0 rounded-lg"
        />

        {/* Left: Icon + Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1 z-10 pointer-events-none">
          <div
            className={`rounded ${notebook.coverColor} bg-opacity-[3%] flex items-center justify-center shrink-0 w-7 h-7`}
          >
            <Icon
              className={`${(notebook.coverColor || "").replace("bg-", "text-")} opacity-50 w-3.5 h-3.5`}
            />
          </div>
          <span className="font-medium text-foreground font-serif truncate group-hover:text-primary transition-colors text-sm">
            {notebook.title}
          </span>
        </div>

        {/* Right: Sources + Menu */}
        <div className="flex items-center gap-2 shrink-0 z-10">
          <div className="inline-flex items-center gap-1 bg-secondary/40 px-1.5 py-0.5 rounded text-xs font-medium text-muted-foreground pointer-events-none">
            <FileText className="w-3 h-3 shrink-0" />
            <span>{notebook.sourceCount}</span>
          </div>

          {!notebook.isSharedNotebook ? (
            <div className="kebab-menu relative pointer-events-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMenuOpen) onCloseMenu();
                  else onToggleMenu();
                }}
                className={`p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center shrink-0 opacity-100 ${isMenuOpen ? "bg-secondary" : ""}`}
              >
                <MoreVertical className="w-3.5 h-3.5 shrink-0" />
              </button>
              {isMenuOpen && (
                <NotebookMenuDropdown
                  onOpenCustomize={onOpenCustomize}
                  onOpenMoveToFolder={onOpenMoveToFolder}
                  onDelete={handleDeleteWithConfirmation}
                  onCloseMenu={onCloseMenu}
                />
              )}
            </div>
          ) : (
            <SharedBadge size="sm" />
          )}
        </div>
      </div>
      <ConfirmDialogComponent />
    </>
  );
}

// ─── List (Main View) Variant ──────────────────────────────────────────────────

interface NotebookCardListProps extends SharedNotebookCardProps {
  showAuthor?: boolean;
}

export function NotebookCardList({
  showAuthor = false,
  ...props
}: NotebookCardListProps) {
  const { notebook, onSelectNotebook } = props;
  const {
    isMenuOpen,
    onOpenCustomize,
    onOpenMoveToFolder,
    onCloseMenu,
    onToggleMenu,
    handleDeleteWithConfirmation,
    ConfirmDialogComponent,
  } = useNotebookCardActions(props);

  const Icon = notebook.icon ? IconMap[notebook.icon] : Folder;

  return (
    <>
      <div className="group grid grid-cols-[minmax(200px,1fr)_100px_48px] items-center gap-4 bg-card border border-border/50 hover:border-primary/30 hover:shadow-md cursor-pointer transition-all relative p-4 rounded-xl">
        <div
          onClick={() => onSelectNotebook(notebook)}
          className="absolute inset-0 z-0 rounded-xl"
        />

        {/* Title Column */}
        <div className="flex items-center gap-3 min-w-0 z-10 pointer-events-none">
          <div
            className={`rounded-md ${notebook.coverColor} bg-opacity-[3%] flex items-center justify-center shrink-0 w-9 h-9`}
          >
            <Icon
              className={`${(notebook.coverColor || "").replace("bg-", "text-")} opacity-50 w-4 h-4`}
            />
          </div>
          <span className="font-medium text-foreground font-serif truncate group-hover:text-primary transition-colors text-base">
            {notebook.title}
          </span>
        </div>

        {/* Sources Column */}
        <div className="text-right z-10 pointer-events-none">
          <div className="inline-flex items-center gap-1.5 bg-secondary/40 hover:bg-secondary/60 px-2.5 py-1 rounded text-xs font-medium text-muted-foreground transition-colors">
            {showAuthor ? (
              <Globe className="w-3 h-3 shrink-0" />
            ) : (
              <FileText className="w-3 h-3 shrink-0" />
            )}
            <span>{notebook.sourceCount}</span>
          </div>
        </div>

        {/* Action Column */}
        <div className="flex justify-end z-20 pointer-events-auto kebab-menu relative">
          {!notebook.isSharedNotebook ? (
            <>
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
                <NotebookMenuDropdown
                  onOpenCustomize={onOpenCustomize}
                  onOpenMoveToFolder={onOpenMoveToFolder}
                  onDelete={handleDeleteWithConfirmation}
                  onCloseMenu={onCloseMenu}
                />
              )}
            </>
          ) : (
            <SharedBadge size="md" />
          )}
        </div>
      </div>
      <ConfirmDialogComponent />
    </>
  );
}

// ─── Backwards-compatible re-export ────────────────────────────────────────────

interface NotebookCardProps {
  notebook: NotebookItem;
  viewMode: "grid" | "list";
  isMenuOpen: boolean;
  onSelectNotebook: (notebook: NotebookItem) => void;
  onOpenCustomize: () => void;
  onOpenMoveToFolder: () => void;
  onDeleteNotebook: (id: string) => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  showAuthor?: boolean;
  isInFolder?: boolean;
}

/**
 * Backwards-compatible wrapper that delegates to the appropriate variant.
 * Prefer importing the specific variant component directly.
 */
export const NotebookCard: React.FC<NotebookCardProps> = ({
  viewMode,
  isInFolder = false,
  showAuthor = false,
  ...rest
}) => {
  if (viewMode === "grid") {
    return <NotebookCardGrid {...rest} />;
  }
  if (isInFolder) {
    return <NotebookCardListInFolder {...rest} />;
  }
  return <NotebookCardList {...rest} showAuthor={showAuthor} />;
};
