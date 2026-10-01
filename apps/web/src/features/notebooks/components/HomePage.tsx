import React, { useCallback, useState } from "react";
import { Tabs, TabsContent } from "@/shared/components/ui/tabs";
import { useLimitErrorToast } from "@/shared/hooks/useLimitErrorToast";
import { useFolderHandlers, useNotebookHandlers, useNotebookSorting } from "../hooks";
import { useCreateFolder } from "../services/foldersApi";
import { useCreateNotebook } from "../services/notebooksApi";
import { useNotebookContext } from "../useNotebookContext";
import type { ViewMode } from "./home/CardGrid";
import { HomeHeader, type HomeTab } from "./home/HomeHeader";
import { CustomizeFolderModal, CustomizeNotebookModal, MoveToFolderModal } from "./modals";
import { FeaturedSection, RecentSection } from "./views";

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

export const HomePage: React.FC = () => {
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
  const isAuthenticated = ctx.isAuthenticated;

  const [tab, setTab] = useState<HomeTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Limit error handling
  const { handleLimitError } = useLimitErrorToast();

  // Custom hooks for state and handlers
  const notebookHandlers = useNotebookHandlers({
    notebooks: recentNotebooks,
    onUpdateNotebook,
    onDeleteNotebook,
  });

  const folderHandlers = useFolderHandlers({
    onUpdateFolder,
    onDeleteFolder,
  });

  const handleCreateNotebookClick = useCallback(() => {
    if (!isAuthenticated) {
      onRequireAuth("Sign in to create a notebook.");
      return;
    }
    notebookHandlers.openCreateNotebook();
  }, [isAuthenticated, onRequireAuth, notebookHandlers.openCreateNotebook]);

  const handleCreateFolderClick = useCallback(() => {
    if (!isAuthenticated) {
      onRequireAuth("Sign in to create a folder.");
      return;
    }
    folderHandlers.openCreateFolder();
  }, [isAuthenticated, onRequireAuth, folderHandlers.openCreateFolder]);

  // Convex hooks for mutations
  const createNotebookHook = useCreateNotebook();
  const createFolderHook = useCreateFolder();

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
      console.error("Failed to create notebook:", error);
      const handled = await handleLimitError(error);

      if (!handled.isLimitError) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        if (errorMessage.includes("Unauthorized") || errorMessage.includes("Unauthenticated")) {
          notebookHandlers.closeCustomize();
          onRequireAuth("You need to sign in to create a notebook.");
          return;
        }
        // Anything else is reported by the dialog.
        throw error;
      }
    }
  };

  // Failures propagate to the dialog, which reports them and stays open for a retry.
  const handleUpdateNotebookFromModal = async (id: string, data: NotebookCreateData) => {
    await onUpdateNotebook(id, data);
    notebookHandlers.closeCustomize();
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
      console.error("Failed to create folder:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("Unauthorized") || errorMessage.includes("Unauthenticated")) {
        folderHandlers.closeFolderCustomize();
        onRequireAuth("You need to sign in to create a folder.");
        return;
      }
      // Anything else is reported by the dialog.
      throw error;
    }
  };

  const handleUpdateFolderFromModal = async (id: string, data: FolderCreateData) => {
    await onUpdateFolder(id, data);
    folderHandlers.closeFolderCustomize();
  };

  const { sortOption, setSortOption, getSortedNotebooks } = useNotebookSorting();

  // Sort notebooks based on current sort option
  const sortedRecentNotebooks = getSortedNotebooks(recentNotebooks);
  const sortedFeaturedNotebooks = getSortedNotebooks(featuredNotebooks);

  const handleMoveNotebook = (notebookId: string, folderId: string | null) => {
    onMoveNotebookToFolder(notebookId, folderId);
    notebookHandlers.closeMoveToFolder();
  };

  const featuredSection = (
    <FeaturedSection
      featuredNotebooks={sortedFeaturedNotebooks}
      viewMode={viewMode}
      onSelectNotebook={onSelectNotebook}
      // Not while loading: an empty list then means "not loaded yet", not "none".
      showEmpty={tab === "featured" && !ctx.notebooksLoading}
    />
  );

  const recentSection = (
    <RecentSection
      recentNotebooks={sortedRecentNotebooks}
      folders={folders}
      viewMode={viewMode}
      isLoading={ctx.notebooksLoading}
      onCreateNotebook={handleCreateNotebookClick}
      onSelectNotebook={onSelectNotebook}
      onSelectFolder={onSelectFolder}
      onOpenCustomize={notebookHandlers.openCustomize}
      onOpenMoveToFolder={notebookHandlers.openMoveToFolder}
      onDeleteNotebook={onDeleteNotebook}
      onOpenFolderCustomize={folderHandlers.openFolderCustomize}
      onDeleteFolder={onDeleteFolder}
    />
  );

  return (
    <div className="flex-1 overflow-y-auto bg-background px-4 pt-6 pb-20 sm:px-6 md:px-10 md:pt-10">
      <div className="mx-auto max-w-400">
        <Tabs value={tab} onValueChange={(value) => setTab(value as HomeTab)}>
          <div className="flex flex-col gap-8">
            <HomeHeader
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sortOption={sortOption}
              onSortChange={setSortOption}
              onCreateNotebook={handleCreateNotebookClick}
              onCreateFolder={handleCreateFolderClick}
            />
            <TabsContent value="all">
              <div className="flex flex-col gap-8">
                {featuredSection}
                {recentSection}
              </div>
            </TabsContent>
            <TabsContent value="mine">{recentSection}</TabsContent>
            <TabsContent value="featured">{featuredSection}</TabsContent>
          </div>
        </Tabs>
      </div>

      {/* CUSTOMIZE NOTEBOOK MODAL */}
      {(notebookHandlers.customizingId || notebookHandlers.isCreatingNotebook) && (
        <CustomizeNotebookModal
          notebook={
            notebookHandlers.isCreatingNotebook
              ? undefined
              : [...featuredNotebooks, ...recentNotebooks].find(
                  (n) => n.id === notebookHandlers.customizingId
                )
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
          folder={
            folderHandlers.isCreatingFolder
              ? undefined
              : folders.find((f) => f.id === folderHandlers.folderCustomizingId)
          }
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
