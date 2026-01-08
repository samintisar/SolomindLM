import React from 'react';
import { NotebookItem, FolderItem } from '@/shared/types/index';
import { NotebookCard } from '../cards/NotebookCard';

interface FolderExpandedViewProps {
  folder: FolderItem;
  notebooks: NotebookItem[];
  isLoading: boolean;
  viewMode: 'grid' | 'list';
  onSelectNotebook: (notebook: NotebookItem) => void;
  // Notebook handlers
  activeMenuId: string | null;
  onOpenCustomize: (id: string) => void;
  onOpenMoveToFolder: (id: string) => void;
  onDeleteNotebook: (id: string) => void;
  setActiveMenuId: (id: string | null) => void;
}

export const FolderExpandedView: React.FC<FolderExpandedViewProps> = ({
  folder,
  notebooks,
  isLoading,
  viewMode,
  onSelectNotebook,
  activeMenuId,
  onOpenCustomize,
  onOpenMoveToFolder,
  onDeleteNotebook,
  setActiveMenuId,
}) => {
  if (isLoading) {
    return (
      <div className="mt-2 text-center py-4 text-sm text-muted-foreground bg-card rounded-lg border border-border">
        Loading notebooks...
      </div>
    );
  }

  if (notebooks.length === 0) {
    return (
      <div className="mt-2 text-center py-4 text-sm text-muted-foreground bg-card rounded-lg border border-border">
        No notebooks in this folder
      </div>
    );
  }

  // Always use list view for notebooks within folders, regardless of parent viewMode
  return (
    <div className="space-y-1 mt-3">
      {notebooks.map((nb) => (
        <NotebookCard
          key={nb.id}
          notebook={nb}
          viewMode="list"
          isMenuOpen={activeMenuId === nb.id}
          onSelectNotebook={onSelectNotebook}
          onOpenCustomize={() => onOpenCustomize(nb.id)}
          onOpenMoveToFolder={() => onOpenMoveToFolder(nb.id)}
          onDeleteNotebook={onDeleteNotebook}
          onToggleMenu={() => setActiveMenuId(activeMenuId === nb.id ? null : nb.id)}
          onCloseMenu={() => setActiveMenuId(null)}
          isInFolder={true}
        />
      ))}
    </div>
  );
};
