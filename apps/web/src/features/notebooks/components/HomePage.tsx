import React, { useCallback, useState } from "react";
import { useClaimPendingDeck } from "@/features/tools/hooks/useClaimPendingDeck";
import { Tabs, TabsContent } from "@/shared/components/ui/tabs";
import { useNotebookDialogs, useNotebookSorting } from "../hooks";
import { useNotebookContext } from "../useNotebookContext";
import type { ViewMode } from "./home/CardGrid";
import { HomeHeader, type HomeTab } from "./home/HomeHeader";
import { CustomizeFolderModal, CustomizeNotebookModal, MoveToFolderModal } from "./modals";
import { FeaturedSection, RecentSection } from "./views";

export const HomePage: React.FC = () => {
  // OAuth sign-in from the free flashcard tool lands here: save the deck the visitor made.
  useClaimPendingDeck();
  const ctx = useNotebookContext();
  const featuredNotebooks = ctx.featuredNotebooks;
  const recentNotebooks = ctx.recentNotebooks;
  const onSelectNotebook = ctx.selectNotebook;
  const onSelectFolder = ctx.selectFolder;
  const onDeleteNotebook = ctx.deleteNotebook;
  const folders = ctx.folders;
  const onDeleteFolder = ctx.deleteFolder;
  const onMoveNotebookToFolder = ctx.moveNotebookToFolder;
  const onRequireAuth = ctx.onRequireAuth;
  const isAuthenticated = ctx.isAuthenticated;

  const [tab, setTab] = useState<HomeTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const dialogs = useNotebookDialogs();
  const { openCreateNotebook, openCreateFolder } = dialogs;

  const handleCreateNotebookClick = useCallback(() => {
    if (!isAuthenticated) {
      onRequireAuth("Sign in to create a notebook.");
      return;
    }
    openCreateNotebook();
  }, [isAuthenticated, onRequireAuth, openCreateNotebook]);

  const handleCreateFolderClick = useCallback(() => {
    if (!isAuthenticated) {
      onRequireAuth("Sign in to create a folder.");
      return;
    }
    openCreateFolder();
  }, [isAuthenticated, onRequireAuth, openCreateFolder]);

  const { sortOption, setSortOption, getSortedNotebooks } = useNotebookSorting();

  // Sort notebooks based on current sort option
  const sortedRecentNotebooks = getSortedNotebooks(recentNotebooks);
  const sortedFeaturedNotebooks = getSortedNotebooks(featuredNotebooks);

  const handleMoveNotebook = (notebookId: string, folderId: string | null) => {
    onMoveNotebookToFolder(notebookId, folderId);
    dialogs.closeMoveToFolder();
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
      onOpenCustomize={dialogs.openCustomize}
      onOpenMoveToFolder={dialogs.openMoveToFolder}
      onDeleteNotebook={onDeleteNotebook}
      onOpenFolderCustomize={dialogs.openFolderCustomize}
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
      {(dialogs.customizingId || dialogs.isCreatingNotebook) && (
        <CustomizeNotebookModal
          notebook={
            dialogs.isCreatingNotebook
              ? undefined
              : [...featuredNotebooks, ...recentNotebooks].find(
                  (n) => n.id === dialogs.customizingId
                )
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

      {/* FOLDER CUSTOMIZE MODAL */}
      {(dialogs.folderCustomizingId || dialogs.isCreatingFolder) && (
        <CustomizeFolderModal
          folder={
            dialogs.isCreatingFolder
              ? undefined
              : folders.find((f) => f.id === dialogs.folderCustomizingId)
          }
          onClose={dialogs.closeFolderCustomize}
          onSave={dialogs.saveFolder}
        />
      )}
    </div>
  );
};
