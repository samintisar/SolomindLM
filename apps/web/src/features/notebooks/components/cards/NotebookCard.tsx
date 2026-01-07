import React from 'react';
import { MoreVertical, Settings2, Trash2, FolderOpen, FileText, Book, Globe, BarChart3, Monitor, Search, Brain, Folder, GraduationCap, Lightbulb } from 'lucide-react';
import { NotebookItem } from '@/shared/types/index';
import { ConfirmDialog, useConfirmDialog } from '@/shared/ui/ConfirmDialog';

const IconMap: Record<string, React.FC<any>> = {
  Folder, Book, BarChart: BarChart3, Monitor, Search, Brain, Globe, FileText, GraduationCap, Lightbulb
};

interface NotebookCardProps {
  notebook: NotebookItem;
  viewMode: 'grid' | 'list';
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

export const NotebookCard: React.FC<NotebookCardProps> = ({
  notebook,
  viewMode,
  isMenuOpen,
  onSelectNotebook,
  onOpenCustomize,
  onOpenMoveToFolder,
  onDeleteNotebook,
  onToggleMenu,
  onCloseMenu,
  showAuthor = false,
  isInFolder = false,
}) => {
  const Icon = notebook.icon ? IconMap[notebook.icon] : Folder;
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const handleDeleteWithConfirmation = async () => {
    const confirmed = await confirm(
      'Delete Notebook',
      `Are you sure you want to delete "${notebook.title}"? This action cannot be undone.`,
      { confirmText: 'Delete', cancelText: 'Cancel', variant: 'danger' }
    );
    if (confirmed) {
      onDeleteNotebook(notebook.id);
    }
  };
  
  // Format date to remove the year (e.g., "JAN 2, 2026" -> "JAN 2")
  const formatDate = (dateString: string) => {
    try {
      const parts = dateString.split(',');
      return parts[0].trim(); // Returns "JAN 2" from "JAN 2, 2026"
    } catch {
      return dateString;
    }
  };

  if (viewMode === 'grid') {
    return (
      <>
      <div
        className={`group relative aspect-16/10 rounded-2xl bg-card border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col ring-1 ring-border/50 ${isInFolder ? '' : ''}`}
      >
        {/* Top Decorative Half */}
        <div
          onClick={() => onSelectNotebook(notebook)}
          className={`h-[55%] ${notebook.coverColor} bg-opacity-15 group-hover:bg-opacity-25 transition-colors p-5 relative flex items-start justify-between rounded-t-2xl`}
        >
          <Icon className={`w-10 h-10 ${(notebook.coverColor || '').replace('bg-', 'text-')} opacity-90 group-hover:scale-110 transition-transform duration-300 drop-shadow-sm`} />

          <div className="relative kebab-menu z-20" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => isMenuOpen ? onCloseMenu() : onToggleMenu()}
              className={`p-1.5 -mr-1.5 -mt-1.5 hover:bg-black/10 rounded-full text-muted-foreground/70 hover:text-foreground transition-colors ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMenuOpen && (
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
                  onClick={() => { handleDeleteWithConfirmation(); onCloseMenu(); }}
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
          onClick={() => onSelectNotebook(notebook)}
          className="h-[45%] p-5 flex flex-col justify-between bg-card relative rounded-b-2xl"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-border to-transparent opacity-50" />

          <h3 className="text-base font-bold text-foreground leading-snug line-clamp-2 font-sans">{notebook.title}</h3>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            <span className="font-mono">{formatDate(notebook.date)}</span>
            <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-0.5 rounded-full">
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

  // List view
  if (isInFolder) {
    return (
      <>
      <div
        className="group grid grid-cols-[minmax(200px,1fr)_140px_100px_48px] items-center gap-4 bg-card border border-border/50 hover:border-primary/30 hover:shadow-md cursor-pointer transition-all relative p-4 rounded-xl"
      >
        {/* Clickable Overlay */}
        <div onClick={() => onSelectNotebook(notebook)} className="absolute inset-0 z-0 rounded-xl" />

        {/* Title Column */}
        <div className="flex items-center gap-3 min-w-0 z-10 pointer-events-none">
          <div className={`rounded-md ${notebook.coverColor} bg-opacity-15 flex items-center justify-center shrink-0 w-9 h-9`}>
            <Icon className={`${(notebook.coverColor || '').replace('bg-', 'text-')} w-4 h-4`} />
          </div>

          <span className="font-medium text-foreground font-serif truncate group-hover:text-primary transition-colors text-base">{notebook.title}</span>
        </div>

        {/* Date Column */}
        <div className="text-muted-foreground font-mono z-10 pointer-events-none whitespace-nowrap text-sm">
          {formatDate(notebook.date)}
        </div>

        {/* Sources Column */}
        <div className="text-right z-10 pointer-events-none">
          <div className="inline-flex items-center gap-1.5 bg-secondary/40 hover:bg-secondary/60 px-2.5 py-1 rounded text-xs font-medium text-muted-foreground transition-colors">
            {showAuthor ? <Globe className="w-3 h-3 shrink-0" /> : <FileText className="w-3 h-3 shrink-0" />}
            <span>{notebook.sourceCount}</span>
          </div>
        </div>

        {/* Action Column */}
        <div className="flex justify-end z-20 pointer-events-auto kebab-menu relative">
          <button
            onClick={(e) => { e.stopPropagation(); isMenuOpen ? onCloseMenu() : onToggleMenu(); }}
            className={`p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center shrink-0 ${isMenuOpen ? 'opacity-100 bg-secondary' : 'opacity-0 group-hover:opacity-100'}`}
          >
            <MoreVertical className="w-4 h-4 shrink-0" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-lg z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
              <button
                onClick={(e) => { e.stopPropagation(); onOpenCustomize(); }}
                className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5 shrink-0" /> Customize
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenMoveToFolder(); }}
                className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0" /> Move to folder
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteWithConfirmation(); onCloseMenu(); }}
                className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialogComponent />
      </>
    );
  }

  return (
    <>
    <div
      className="group grid grid-cols-[minmax(200px,1fr)_140px_100px_48px] items-center gap-4 bg-card border border-border/50 hover:border-primary/30 hover:shadow-md cursor-pointer transition-all relative p-4 rounded-xl"
    >
      {/* Clickable Overlay */}
      <div onClick={() => onSelectNotebook(notebook)} className="absolute inset-0 z-0 rounded-xl" />

      {/* Title Column */}
      <div className="flex items-center gap-3 min-w-0 z-10 pointer-events-none">
        <div className={`rounded-md ${notebook.coverColor} bg-opacity-15 flex items-center justify-center shrink-0 w-9 h-9`}>
          <Icon className={`${(notebook.coverColor || '').replace('bg-', 'text-')} w-4 h-4`} />
        </div>

        <span className="font-medium text-foreground font-serif truncate group-hover:text-primary transition-colors text-base">{notebook.title}</span>
      </div>

      {/* Date Column */}
      <div className="text-muted-foreground font-mono z-10 pointer-events-none whitespace-nowrap text-sm">
        {formatDate(notebook.date)}
      </div>

      {/* Sources Column */}
      <div className="text-right z-10 pointer-events-none">
        <div className="inline-flex items-center gap-1.5 bg-secondary/40 hover:bg-secondary/60 px-2.5 py-1 rounded text-xs font-medium text-muted-foreground transition-colors">
          {showAuthor ? <Globe className="w-3 h-3 shrink-0" /> : <FileText className="w-3 h-3 shrink-0" />}
          <span>{notebook.sourceCount}</span>
        </div>
      </div>

      {/* Action Column */}
      <div className="flex justify-end z-20 pointer-events-auto kebab-menu relative">
        <button
          onClick={(e) => { e.stopPropagation(); isMenuOpen ? onCloseMenu() : onToggleMenu(); }}
          className={`p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center shrink-0 ${isMenuOpen ? 'opacity-100 bg-secondary' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <MoreVertical className="w-4 h-4 shrink-0" />
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-lg z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={(e) => { e.stopPropagation(); onOpenCustomize(); }}
              className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5 shrink-0" /> Customize
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenMoveToFolder(); }}
              className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" /> Move to folder
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteWithConfirmation(); onCloseMenu(); }}
              className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
    <ConfirmDialogComponent />
    </>
  );
};
