import React, { useState, useEffect } from 'react';
import { LayoutGrid, List, ChevronDown, Calendar, ArrowUpAZ, CheckCircle2 } from 'lucide-react';
import { NotebookItem, FolderItem } from '@/shared/types/index';
import { FeaturedSection, RecentSection } from './views';
import { CustomizeNotebookModal, MoveToFolderModal, CustomizeFolderModal } from './modals';
import { useNotebookHandlers, useFolderHandlers, useNotebookSorting } from '../hooks';
import { useNotebookContext } from '../NotebookContext';
import { useCreateNotebook, useUpdateNotebook } from '../services/notebooksApi';
import { useCreateFolder, useUpdateFolder } from '../services/foldersApi';
import { useLimitErrorToast } from '@/shared/hooks/useLimitErrorToast';

interface NotebookCreateData {
  title: string;
  coverColor: string;
  icon: string;
}

interface FolderCreateData {
  name: string;
  color: string;
  icon: string;
}

interface HomePageProps {
  featuredNotebooks?: NotebookItem[];
  recentNotebooks?: NotebookItem[];
  onSelectNotebook?: (notebook: NotebookItem) => void;
  onSelectFolder?: (folderId: string) => void;
  onCreateNotebook?: () => void;
  onUpdateNotebook?: (id: string, updates: Partial<NotebookItem>) => void;
  onDeleteNotebook?: (id: string) => void;
  folders?: FolderItem[];
  onCreateFolder?: () => void;
  onUpdateFolder?: (id: string, updates: Partial<FolderItem>) => void;
  onDeleteFolder?: (id: string) => void;
  onMoveNotebookToFolder?: (notebookId: string, folderId: string | null) => void;
  onRequireAuth?: (errorMessage: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  // Props kept for backward compatibility during migration; context is preferred
}) => {
  const ctx = useNotebookContext();
  const featuredNotebooks = ctx.featuredNotebooks;
  const recentNotebooks = ctx.recentNotebooks;
  const onSelectNotebook = ctx.selectNotebook;
  const onSelectFolder = ctx.selectFolder;
  const onUpdateNotebook = ctx.updateNotebook;
  const onDeleteNotebook = ctx.deleteNotebook;
  const folders = ctx.folders;
  const onUpdateFolder = ctx.updateFolder;
  const onDeleteFolder = ctx.deleteFolder;
  const onMoveNotebookToFolder = ctx.moveNotebookToFolder;
  const onRequireAuth = ctx.onRequireAuth;

  const [activeTab, setActiveTab] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Limit error handling
  const { handleLimitError } = useLimitErrorToast();

  const deleteNotebookHandler: (id: string) => void = onDeleteNotebook ?? ((_id: string) => {});

  // Custom hooks for state and handlers
  const notebookHandlers = useNotebookHandlers({
    notebooks: recentNotebooks,
    onUpdateNotebook,
    onDeleteNotebook: deleteNotebookHandler,
  });

  const folderHandlers = useFolderHandlers({
    onUpdateFolder,
    onDeleteFolder,
  });

  // Convex hooks for mutations
  const createNotebookHook = useCreateNotebook();
  useUpdateNotebook();
  const createFolderHook = useCreateFolder();
  useUpdateFolder();

  // Handlers for creating notebooks and folders via modal
  const handleCreateNotebookFromModal = async (data: NotebookCreateData) => {
    try {
      await createNotebookHook({
        title: data.title,
        coverColor: data.coverColor,
        icon: data.icon,
      });
      notebookHandlers.closeCustomize();
      // Optimistic updates handle the UI update automatically
    } catch (error) {
      console.error('Failed to create notebook:', error);
      const handled = await handleLimitError(error);

      if (!handled.isLimitError) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('Unauthorized')) {
          notebookHandlers.closeCustomize();
          if (onRequireAuth) onRequireAuth('You need to sign in to create a notebook.');
        }
      }
    }
  };

  const handleUpdateNotebookFromModal = async (id: string, data: NotebookCreateData) => {
    try {
      // Call the parent's onUpdateNotebook which handles optimistic updates and state management
      await onUpdateNotebook(id, data);
      notebookHandlers.closeCustomize();
    } catch (error) {
      console.error('Failed to update notebook:', error);
    }
  };

  const handleCreateFolderFromModal = async (data: FolderCreateData) => {
    try {
      await createFolderHook({
        name: data.name,
        color: data.color,
        icon: data.icon,
      });
      folderHandlers.closeFolderCustomize();
      // Optimistic updates handle the UI update automatically
    } catch (error) {
      console.error('Failed to create folder:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Unauthorized')) {
        folderHandlers.closeFolderCustomize();
        if (onRequireAuth) onRequireAuth('You need to sign in to create a folder.');
      }
    }
  };

  const handleUpdateFolderFromModal = async (id: string, data: FolderCreateData) => {
    try {
      // Call the parent's onUpdateFolder which handles state management
      if (onUpdateFolder) {
        await onUpdateFolder(id, data);
      }
      folderHandlers.closeFolderCustomize();
    } catch (error) {
      console.error('Failed to update folder:', error);
    }
  };

  const { sortOption, isSortMenuOpen, setSortOption, setIsSortMenuOpen, getSortedNotebooks } = useNotebookSorting();

  // Sort notebooks based on current sort option
  const sortedRecentNotebooks = getSortedNotebooks(recentNotebooks);
  const sortedFeaturedNotebooks = getSortedNotebooks(featuredNotebooks);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notebookHandlers.activeMenuId && !(e.target as Element).closest('.kebab-menu')) {
        notebookHandlers.setActiveMenuId(null);
      }
      if (folderHandlers.folderActiveMenuId && !(e.target as Element).closest('.folder-kebab-menu')) {
        folderHandlers.setFolderActiveMenuId(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [notebookHandlers.activeMenuId, folderHandlers.folderActiveMenuId, notebookHandlers.setActiveMenuId, folderHandlers.setFolderActiveMenuId]);

  const handleMoveNotebook = (notebookId: string, folderId: string | null) => {
    if (onMoveNotebookToFolder) {
      onMoveNotebookToFolder(notebookId, folderId);
    }
    notebookHandlers.closeMoveToFolder();
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 md:p-12 font-serif animate-in fade-in duration-500">
      <div className="max-w-[1600px] mx-auto space-y-10">

        {/* Top Navigation Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">

          {/* Left Tabs */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            {['All', 'My notebooks', 'Featured notebooks'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  px-5 py-2 rounded-full text-sm font-sans font-bold transition-all
                  ${activeTab === tab
                    ? 'bg-foreground text-background shadow-md'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}
                `}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3 self-end md:self-auto w-full md:w-auto justify-end">

            {/* View Toggles */}
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

        {/* Content Area */}
        <div className="space-y-12">
          {/* Featured Section */}
          {(activeTab === 'All' || activeTab === 'Featured notebooks') && (
            <FeaturedSection
              featuredNotebooks={sortedFeaturedNotebooks}
              viewMode={viewMode}
              onSelectNotebook={onSelectNotebook}
            />
          )}

        {/* Recent Notebooks Section */}
        {(activeTab === 'All' || activeTab === 'My notebooks') && (
          <RecentSection
              recentNotebooks={sortedRecentNotebooks}
              folders={folders}
              viewMode={viewMode}
              onCreateNotebook={notebookHandlers.openCreateNotebook}
              onCreateFolder={folderHandlers.openCreateFolder}
              onSelectNotebook={onSelectNotebook}
              onSelectFolder={onSelectFolder}
              // Notebook handlers
              activeMenuId={notebookHandlers.activeMenuId}
              onOpenCustomize={notebookHandlers.openCustomize}
              onOpenMoveToFolder={notebookHandlers.openMoveToFolder}
              onDeleteNotebook={deleteNotebookHandler}
              setActiveMenuId={notebookHandlers.setActiveMenuId}
              // Folder handlers
              folderActiveMenuId={folderHandlers.folderActiveMenuId}
              onOpenFolderCustomize={folderHandlers.openFolderCustomize}
              onDeleteFolder={onDeleteFolder ?? ((_id: string) => {})}
              setFolderActiveMenuId={folderHandlers.setFolderActiveMenuId}
              // Sorting
              getSortedNotebooks={getSortedNotebooks}
            />
          )}
        </div>
      </div>

      {/* CUSTOMIZE NOTEBOOK MODAL */}
      {(notebookHandlers.customizingId || notebookHandlers.isCreatingNotebook) && (
        <CustomizeNotebookModal
          notebook={
            notebookHandlers.isCreatingNotebook 
              ? undefined 
              : [...featuredNotebooks, ...recentNotebooks].find(n => n.id === notebookHandlers.customizingId)
          }
          onClose={notebookHandlers.closeCustomize}
          onSave={async (data) => {
            if (notebookHandlers.isCreatingNotebook) {
              await handleCreateNotebookFromModal(data);
            } else {
              await handleUpdateNotebookFromModal(notebookHandlers.customizingId!, data);
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

      {/* FOLDER CUSTOMIZE MODAL */}
      {(folderHandlers.folderCustomizingId || folderHandlers.isCreatingFolder) && (
        <CustomizeFolderModal
          folder={folderHandlers.isCreatingFolder ? undefined : folders.find(f => f.id === folderHandlers.folderCustomizingId)}
          onClose={folderHandlers.closeFolderCustomize}
          onSave={async (data) => {
            if (folderHandlers.isCreatingFolder) {
              await handleCreateFolderFromModal(data);
            } else {
              await handleUpdateFolderFromModal(folderHandlers.folderCustomizingId!, data);
            }
          }}
        />
      )}
    </div>
  );
};
