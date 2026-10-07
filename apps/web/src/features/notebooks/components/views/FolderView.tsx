import { ArrowLeft, Plus } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/components/ui/empty";
import { useNotebookDialogs, useNotebookSorting } from "../../hooks";
import { useFolderNotebooks } from "../../services/foldersApi";
import { useNotebookContext } from "../../useNotebookContext";
import { NotebookCard } from "../cards/NotebookCard";
import { CardGrid, CardGridItem, type ViewMode } from "../home/CardGrid";
import { GridSkeleton } from "../home/GridSkeleton";
import { ViewControls } from "../home/ViewControls";
import { ListHeader } from "../ListHeader";
import { CustomizeNotebookModal, MoveToFolderModal } from "../modals";

interface FolderViewProps {
  folderId: string;
  viewMode: ViewMode;
}

export const FolderView: React.FC<FolderViewProps> = ({ folderId, viewMode: initialViewMode }) => {
  const ctx = useNotebookContext();
  const onBack = ctx.folderBack;
  const onSelectNotebook = ctx.selectNotebook;
  const onDeleteNotebook = ctx.deleteNotebook;
  const onMoveNotebookToFolder = ctx.moveNotebookToFolder;
  const folders = ctx.folders;

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  // Use Convex hooks - undefined means loading, empty array means no results
  const folderNotebooks = useFolderNotebooks(folderId);

  // Find folder from props - use useMemo to avoid recalculating
  const folder = useMemo(() => {
    if (folders.length > 0) {
      return folders.find((f) => f.id === folderId) || null;
    }
    return null;
  }, [folders, folderId]);

  const dialogs = useNotebookDialogs({ folderId });

  const { sortOption, setSortOption, getSortedNotebooks } = useNotebookSorting();

  // Sort notebooks based on current sort option
  const sortedNotebooks = getSortedNotebooks(folderNotebooks ?? []);

  // Handler for deleting notebooks in folder view
  const handleDeleteNotebook = async (notebookId: string) => {
    // Call the parent's delete handler
    await onDeleteNotebook(notebookId);
    // Note: Convex hooks will auto-update, but App.tsx handles navigation
  };

  const handleMoveNotebook = async (notebookId: string, targetFolderId: string | null) => {
    await onMoveNotebookToFolder(notebookId, targetFolderId);
    // Optimistic updates handle the UI update automatically
    dialogs.closeMoveToFolder();
  };

  // Loading state
  if (folderNotebooks === undefined || ctx.notebooksLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-background px-4 pt-6 pb-20 sm:px-6 md:px-10 md:pt-10">
        <div className="mx-auto flex max-w-400 flex-col gap-6">
          <div className="-ml-2.5 self-start">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft />
              Back
            </Button>
          </div>
          <GridSkeleton />
        </div>
      </div>
    );
  }

  // Error/Not found state
  if (!folder) {
    return (
      <div className="flex-1 overflow-y-auto bg-background px-4 pt-6 sm:px-6 md:px-10 md:pt-10">
        <div className="mx-auto flex max-w-400 flex-col gap-6">
          <div className="-ml-2.5 self-start">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft />
              Back
            </Button>
          </div>
          <Alert variant="destructive">
            <AlertDescription>Folder not found</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background px-4 pt-6 pb-20 sm:px-6 md:px-10 md:pt-10">
      <div className="mx-auto flex max-w-400 flex-col gap-6">
        <header className="flex flex-col gap-2">
          {/* Back sits above the title like a breadcrumb; the negative margin lines its arrow up
              with the title's left edge. */}
          <div className="-ml-2.5 self-start">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft />
              Back
            </Button>
          </div>
          {/* One row on wider screens: title, then view controls and New notebook on the right.
              On phones the view controls wrap onto their own row below. */}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 flex-1 truncate font-display text-xl font-bold text-foreground sm:text-3xl">
              {folder.name}
            </h1>
            <div className="order-last w-full sm:order-none sm:w-auto">
              <ViewControls
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                sortOption={sortOption}
                onSortChange={setSortOption}
              />
            </div>
            <Button onClick={dialogs.openCreateNotebook}>
              <Plus />
              New notebook
            </Button>
          </div>
        </header>

        {sortedNotebooks.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>This folder is empty</EmptyTitle>
              <EmptyDescription>
                Create a notebook here, or move one in from the home page.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {viewMode === "list" && <ListHeader />}
            <CardGrid viewMode={viewMode}>
              {sortedNotebooks.map((nb, i) => (
                <CardGridItem key={nb.id} index={i}>
                  <NotebookCard
                    notebook={nb}
                    viewMode={viewMode}
                    onSelectNotebook={onSelectNotebook}
                    onOpenCustomize={() => dialogs.openCustomize(nb.id)}
                    onOpenMoveToFolder={() => dialogs.openMoveToFolder(nb.id)}
                    onDeleteNotebook={handleDeleteNotebook}
                  />
                </CardGridItem>
              ))}
            </CardGrid>
          </>
        )}
      </div>

      {/* CUSTOMIZE NOTEBOOK MODAL */}
      {(dialogs.customizingId || dialogs.isCreatingNotebook) && (
        <CustomizeNotebookModal
          notebook={
            dialogs.isCreatingNotebook
              ? undefined
              : sortedNotebooks.find((n) => n.id === dialogs.customizingId)
          }
          onClose={dialogs.closeCustomize}
          onSave={dialogs.saveNotebook}
        />
      )}

      {/* MOVE TO FOLDER MODAL */}
      {dialogs.movingNotebookId && (
        <MoveToFolderModal
          notebookId={dialogs.movingNotebookId}
          folders={folders}
          onClose={dialogs.closeMoveToFolder}
          onMove={handleMoveNotebook}
        />
      )}
    </div>
  );
};
