import { ArrowLeft, Plus } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/components/ui/empty";
import { useNotebookHandlers, useNotebookSorting } from "../../hooks";
import { useFolderNotebooks } from "../../services/foldersApi";
import { useCreateNotebook } from "../../services/notebooksApi";
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
  const onUpdateNotebook = ctx.updateNotebook;
  const onDeleteNotebook = ctx.deleteNotebook;
  const onMoveNotebookToFolder = ctx.moveNotebookToFolder;
  const folders = ctx.folders;
  const onRequireAuth = ctx.onRequireAuth;

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  // Use Convex hooks - undefined means loading, empty array means no results
  const folderNotebooks = useFolderNotebooks(folderId);
  const createNotebook = useCreateNotebook();

  // Find folder from props - use useMemo to avoid recalculating
  const folder = useMemo(() => {
    if (folders.length > 0) {
      return folders.find((f) => f.id === folderId) || null;
    }
    return null;
  }, [folders, folderId]);

  // Custom hooks for state and handlers
  const notebookHandlers = useNotebookHandlers({
    notebooks: folderNotebooks ?? [],
    onUpdateNotebook,
    onDeleteNotebook,
  });

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
    notebookHandlers.closeMoveToFolder();
  };

  // Loading state
  if (folderNotebooks === undefined || ctx.notebooksLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-background px-4 pt-6 pb-20 sm:px-6 md:px-10 md:pt-10">
        <div className="mx-auto flex max-w-400 flex-col gap-6">
          <Button variant="ghost" size="sm" onClick={onBack} className="self-start">
            <ArrowLeft />
            Back
          </Button>
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
          <Button variant="ghost" size="sm" onClick={onBack} className="self-start">
            <ArrowLeft />
            Back
          </Button>
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
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft />
                Back
              </Button>
              <h1 className="truncate font-display text-2xl font-bold text-foreground">
                {folder.name}
              </h1>
            </div>
            <Button onClick={notebookHandlers.openCreateNotebook}>
              <Plus />
              New notebook
            </Button>
          </div>
          <div className="flex justify-end">
            <ViewControls
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sortOption={sortOption}
              onSortChange={setSortOption}
            />
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
                    onOpenCustomize={() => notebookHandlers.openCustomize(nb.id)}
                    onOpenMoveToFolder={() => notebookHandlers.openMoveToFolder(nb.id)}
                    onDeleteNotebook={handleDeleteNotebook}
                  />
                </CardGridItem>
              ))}
            </CardGrid>
          </>
        )}
      </div>

      {/* CUSTOMIZE NOTEBOOK MODAL */}
      {(notebookHandlers.customizingId || notebookHandlers.isCreatingNotebook) && (
        <CustomizeNotebookModal
          notebook={
            notebookHandlers.isCreatingNotebook
              ? undefined
              : sortedNotebooks.find((n) => n.id === notebookHandlers.customizingId)
          }
          onClose={notebookHandlers.closeCustomize}
          onSave={async (data) => {
            if (notebookHandlers.isCreatingNotebook) {
              try {
                // Create notebook using hook
                await createNotebook({
                  title: data.title,
                  coverColor: data.coverColor,
                  icon: data.icon,
                  folderId: folderId,
                });
                notebookHandlers.closeCustomize();
                // Optimistic updates handle the UI update automatically
              } catch (error) {
                console.error("Failed to create notebook:", error);
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                if (
                  errorMessage.includes("Unauthorized") ||
                  errorMessage.includes("Unauthenticated")
                ) {
                  notebookHandlers.closeCustomize();
                  onRequireAuth("You need to sign in to create a notebook.");
                }
              }
            } else {
              await onUpdateNotebook(notebookHandlers.customizingId!, data);
              notebookHandlers.closeCustomize();
              // Optimistic updates handle the UI update automatically
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
