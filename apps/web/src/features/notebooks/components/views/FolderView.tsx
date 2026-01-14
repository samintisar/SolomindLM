import React, { useState, useEffect } from 'react';
import { ArrowLeft, LayoutGrid, List, ChevronDown, Calendar, ArrowUpAZ, CheckCircle2, Plus } from 'lucide-react';
import { NotebookItem, FolderItem } from '@/shared/types/index';
import { NotebookCard } from '../cards/NotebookCard';
import { useNotebookHandlers, useNotebookSorting } from '../../hooks';
import { foldersApi } from '../../services/foldersApi';
import { CustomizeNotebookModal, MoveToFolderModal } from '../modals';

interface FolderViewProps {
  folderId: string;
  viewMode: 'grid' | 'list';
  onBack: () => void;
  onSelectNotebook: (notebook: NotebookItem) => void;
  onCreateNotebook: () => void;
  onUpdateNotebook: (id: string, updates: Partial<NotebookItem>) => void;
  onDeleteNotebook: (id: string) => void;
  onMoveNotebookToFolder?: (notebookId: string, folderId: string | null) => void;
  folders?: FolderItem[];
  loadFolders?: () => void;
  onRequireAuth?: (errorMessage: string) => void;
}

export const FolderView: React.FC<FolderViewProps> = ({
  folderId,
  viewMode: initialViewMode,
  onBack,
  onSelectNotebook,
  onCreateNotebook,
  onUpdateNotebook,
  onDeleteNotebook,
  onMoveNotebookToFolder,
  folders = [],
  loadFolders,
  onRequireAuth,
}) => {
  const [folder, setFolder] = useState<FolderItem | null>(null);
  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialViewMode);

  // Load folder and notebooks
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [folderData, notebooksData] = await Promise.all([
          foldersApi.getFolder(folderId),
          foldersApi.getFolderNotebooks(folderId),
        ]);
        setFolder(folderData);
        setNotebooks(notebooksData);
      } catch (err) {
        console.error('Failed to load folder:', err);
        setError(err instanceof Error ? err.message : 'Failed to load folder');
      } finally {
        setIsLoading(false);
      }
    };

    if (folderId) {
      loadData();
    }
  }, [folderId]);

  // Custom hooks for state and handlers
  const notebookHandlers = useNotebookHandlers({
    notebooks,
    onUpdateNotebook,
    onDeleteNotebook,
  });

  const { sortOption, isSortMenuOpen, setSortOption, setIsSortMenuOpen, getSortedNotebooks } = useNotebookSorting();

  // Sort notebooks based on current sort option
  const sortedNotebooks = getSortedNotebooks(notebooks);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notebookHandlers.activeMenuId && !(e.target as Element).closest('.kebab-menu')) {
        notebookHandlers.setActiveMenuId(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [notebookHandlers.activeMenuId, notebookHandlers.setActiveMenuId]);

  const handleMoveNotebook = (notebookId: string, folderId: string | null) => {
    if (onMoveNotebookToFolder) {
      onMoveNotebookToFolder(notebookId, folderId);
      // Reload notebooks after moving
      foldersApi.getFolderNotebooks(folderId || '').then(setNotebooks).catch(console.error);
      if (loadFolders) loadFolders();
    }
    notebookHandlers.closeMoveToFolder();
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-background p-6 md:p-12 font-serif">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading folder...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !folder) {
    return (
      <div className="flex-1 overflow-y-auto bg-background p-6 md:p-12 font-serif">
        <div className="max-w-[1600px] mx-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
            {error || 'Folder not found'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 md:p-12 font-serif animate-in fade-in duration-500">
      <div className="max-w-[1600px] mx-auto space-y-10">
        {/* Back Button and Folder Header with Controls */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-2xl font-bold text-foreground font-sans">{folder.name}</h1>
          </div>

          {/* Right: View Toggles and Sort */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-card border border-border rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary/50'}`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary/50'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card hover:bg-secondary/50 transition-colors text-sm font-medium shadow-sm min-w-[140px] justify-between"
              >
                <span className="truncate">{sortOption === 'date' ? 'Most recent' : 'Title (A-Z)'}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>

              {isSortMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 animate-in fade-in zoom-in-95 duration-200">
                  <button
                    onClick={() => { setSortOption('date'); setIsSortMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center justify-between text-popover-foreground"
                  >
                    <span className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 opacity-70 shrink-0" /> Most recent</span>
                    {sortOption === 'date' && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                  <button
                    onClick={() => { setSortOption('title'); setIsSortMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center justify-between text-popover-foreground"
                  >
                    <span className="flex items-center gap-2"><ArrowUpAZ className="w-3.5 h-3.5 opacity-70 shrink-0" /> Title (A-Z)</span>
                    {sortOption === 'title' && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notebooks Display */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Create New Notebook Card */}
            <div
              onClick={notebookHandlers.openCreateNotebook}
              className="group aspect-16/10 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-full bg-secondary text-primary flex items-center justify-center group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-sm">
                <Plus className="w-7 h-7" />
              </div>
              <span className="text-base font-bold text-muted-foreground group-hover:text-primary transition-colors font-sans">Create new notebook</span>
            </div>

            {/* Notebook Cards */}
            {sortedNotebooks.map((nb) => (
              <NotebookCard
                key={nb.id}
                notebook={nb}
                viewMode="grid"
                isMenuOpen={notebookHandlers.activeMenuId === nb.id}
                onSelectNotebook={onSelectNotebook}
                onOpenCustomize={() => notebookHandlers.openCustomize(nb.id)}
                onOpenMoveToFolder={() => notebookHandlers.openMoveToFolder(nb.id)}
                onDeleteNotebook={onDeleteNotebook}
                onToggleMenu={() => notebookHandlers.setActiveMenuId(notebookHandlers.activeMenuId === nb.id ? null : nb.id)}
                onCloseMenu={() => notebookHandlers.setActiveMenuId(null)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Create New Notebook Row (List View) */}
            <div
              onClick={notebookHandlers.openCreateNotebook}
              className="grid grid-cols-[minmax(200px,1fr)_140px_100px_48px] gap-4 items-center p-4 mb-2 rounded-lg border border-dashed border-border/50 hover:bg-secondary/20 hover:border-primary/50 cursor-pointer group transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-secondary text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="font-medium text-muted-foreground group-hover:text-foreground transition-colors font-sans">Create new notebook</span>
              </div>
            </div>

            {/* Notebook Rows */}
            {sortedNotebooks.map((nb) => (
              <NotebookCard
                key={nb.id}
                notebook={nb}
                viewMode="list"
                isMenuOpen={notebookHandlers.activeMenuId === nb.id}
                onSelectNotebook={onSelectNotebook}
                onOpenCustomize={() => notebookHandlers.openCustomize(nb.id)}
                onOpenMoveToFolder={() => notebookHandlers.openMoveToFolder(nb.id)}
                onDeleteNotebook={onDeleteNotebook}
                onToggleMenu={() => notebookHandlers.setActiveMenuId(notebookHandlers.activeMenuId === nb.id ? null : nb.id)}
                onCloseMenu={() => notebookHandlers.setActiveMenuId(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* CUSTOMIZE NOTEBOOK MODAL */}
      {(notebookHandlers.customizingId || notebookHandlers.isCreatingNotebook) && (
        <CustomizeNotebookModal
          notebook={
            notebookHandlers.isCreatingNotebook 
              ? undefined 
              : notebooks.find(n => n.id === notebookHandlers.customizingId)
          }
          onClose={notebookHandlers.closeCustomize}
          onSave={async (data) => {
            if (notebookHandlers.isCreatingNotebook) {
              try {
                // Create notebook
                const { notebooksApi } = await import('../../services/notebooksApi');
                const newNotebook = await notebooksApi.createNotebook({
                  title: data.title,
                  coverColor: data.coverColor,
                  icon: data.icon,
                });
                // Move to folder using updateNotebook
                await notebooksApi.updateNotebook(newNotebook.id, { folderId });
                notebookHandlers.closeCustomize();
                // Reload notebooks
                const updatedNotebooks = await foldersApi.getFolderNotebooks(folderId);
                setNotebooks(updatedNotebooks);
                if (loadFolders) loadFolders();
              } catch (error) {
                console.error('Failed to create notebook:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                if (errorMessage.includes('Unauthorized')) {
                  notebookHandlers.closeCustomize();
                  if (onRequireAuth) onRequireAuth('You need to sign in to create a notebook.');
                }
              }
            } else {
              await onUpdateNotebook(notebookHandlers.customizingId!, data);
              notebookHandlers.closeCustomize();
              // Reload notebooks
              const updatedNotebooks = await foldersApi.getFolderNotebooks(folderId);
              setNotebooks(updatedNotebooks);
            }
          }}
        />
      )}

      {/* MOVE TO FOLDER MODAL */}
      {notebookHandlers.movingNotebookId && (
        <MoveToFolderModal
          notebookId={notebookHandlers.movingNotebookId}
          folders={folders}
          onClose={notebookHandlers.closeMoveToFolder}
          onMove={handleMoveNotebook}
        />
      )}
    </div>
  );
};
