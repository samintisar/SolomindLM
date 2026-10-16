import type { Id } from "@convex/_generated/dataModel";
import React, { useCallback, useMemo, useState } from "react";
import { useClaimPendingDeck } from "@/features/tools/hooks/useClaimPendingDeck";
import { Tabs, TabsContent } from "@/shared/components/ui/tabs";
import { useLimitErrorToast } from "@/shared/hooks/useLimitErrorToast";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import type { NotebookItem } from "@/shared/types/index";
import { useFolderHandlers, useNotebookHandlers, useNotebookSorting } from "../hooks";
import { useCreateFolder } from "../services/foldersApi";
import {
  useAdminUnpublishNotebook,
  useCreateNotebook,
  useFeaturedNotebooks,
  useIsAdmin,
  usePublicNotebooks,
  useSetNotebookFeatured,
} from "../services/notebooksApi";
import { useNotebookContext } from "../useNotebookContext";
import type { ViewMode } from "./home/CardGrid";
import { HomeHeader, type HomeTab } from "./home/HomeHeader";
import { CustomizeFolderModal, CustomizeNotebookModal, MoveToFolderModal } from "./modals";
import { PublicSection, RecentSection } from "./views";

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
  // OAuth sign-in from the free flashcard tool lands here: save the deck the visitor made.
  useClaimPendingDeck();
  const ctx = useNotebookContext();
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

  // Re-sort only when a list or the sort option changes, not on every render (modals, tabs).
  // getSortedNotebooks changes exactly when the sort option does.
  const sortedRecentNotebooks = useMemo(
    () => getSortedNotebooks(recentNotebooks),
    [getSortedNotebooks, recentNotebooks]
  );

  const handleMoveNotebook = (notebookId: string, folderId: string | null) => {
    onMoveNotebookToFolder(notebookId, folderId);
    notebookHandlers.closeMoveToFolder();
  };

  // Public notebooks: the curated Featured shelf (All and Public tabs) and the paginated
  // Community grid (Public tab only). Each query subscribes only where it's shown.
  const featuredPublic = useFeaturedNotebooks(tab !== "mine");
  const communityPublic = usePublicNotebooks(tab === "public");
  const isAdmin = useIsAdmin();
  const setFeatured = useSetNotebookFeatured();
  const adminUnpublish = useAdminUnpublishNotebook();
  const { showError } = useServiceErrorToast();

  const runModeration = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      showError(error);
    }
  };

  const publicSectionProps = {
    featured: featuredPublic ?? [],
    featuredLoading: featuredPublic === undefined,
    community: communityPublic.results,
    communityStatus: communityPublic.status,
    onLoadMore: communityPublic.loadNextPage,
    viewMode,
    onSelectNotebook,
    isAdmin,
    onToggleFeatured: (nb: NotebookItem) =>
      void runModeration(() =>
        setFeatured({ notebookId: nb.id as Id<"notebooks">, isFeatured: !nb.isFeatured })
      ),
    onUnpublish: (nb: NotebookItem) =>
      void runModeration(() => adminUnpublish({ notebookId: nb.id as Id<"notebooks"> })),
  };

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
                <PublicSection {...publicSectionProps} featuredOnly />
                {recentSection}
              </div>
            </TabsContent>
            <TabsContent value="mine">{recentSection}</TabsContent>
            <TabsContent value="public">
              <PublicSection {...publicSectionProps} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* CUSTOMIZE NOTEBOOK MODAL */}
      {(notebookHandlers.customizingId || notebookHandlers.isCreatingNotebook) && (
        <CustomizeNotebookModal
          notebook={
            notebookHandlers.isCreatingNotebook
              ? undefined
              : recentNotebooks.find((n) => n.id === notebookHandlers.customizingId)
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
