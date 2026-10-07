import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/shared/contexts/useToast";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { useSourceSearch } from "../hooks/useSourceSearch";
import { useSourceUpload } from "../hooks/useSourceUpload";
import {
  useDocument,
  useDocumentContent,
  useIngestFromGoogleDrive,
  useRefreshNotebookRemoteSources,
  useRefreshRemoteSource,
} from "../services/documentsApi";
import { useSourcesContext } from "../useSourcesContext";
import { requestGoogleDriveAccessToken } from "../utils/requestGoogleDriveAccessToken";
import { copySourceMarkdown, downloadSourceMarkdown } from "../utils/sourceMarkdown";
import { AddSourceDialog } from "./add-source/AddSourceDialog";
import { DiscoverSourcesDialog } from "./discover/DiscoverSourcesDialog";
import type { GoogleDrivePickerHandle, PickedFile } from "./GoogleDrivePicker";
import { GoogleDrivePicker, isGoogleDrivePickerConfigured } from "./GoogleDrivePicker";
import { SourceList } from "./SourceList";
import { SourcesPanelHeader } from "./SourcesPanelHeader";
import { SourceViewer } from "./SourceViewer";

/** Normalize newlines so markdown parses correctly (\r\n and lone \r become \n). */
const normalizeNewlines = (raw: string) => raw.replace(/\r\n?/g, "\n");

export type SourcesPanelFocusRequest = { documentId: string; seq: number };

interface SourcesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  noteId?: string | null;
  onDocumentUploaded?: (documentId: string) => void;
  /** Open this notebook document in the viewer (e.g. citation click). `seq` bumps so the same id can reopen. */
  focusSourceRequest?: SourcesPanelFocusRequest | null;
  onFocusSourceHandled?: () => void;
  onDiscussTopic?: (topic: string) => void;
}

export const SourcesPanel: React.FC<SourcesPanelProps> = ({
  isOpen,
  onClose,
  userId,
  noteId,
  onDocumentUploaded,
  focusSourceRequest,
  onFocusSourceHandled,
  onDiscussTopic,
}) => {
  const {
    sources,
    onToggleSource,
    onToggleAll,
    onDeleteSource,
    onDeleteSelectedSources,
    onRenameSource,
  } = useSourcesContext();
  const { success, error: showError, info: showInfo } = useToast();

  // View state
  const [viewingSourceId, setViewingSourceId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);

  const googleDriveRef = useRef<GoogleDrivePickerHandle>(null);
  const ingestFromDrive = useIngestFromGoogleDrive();
  const refreshNotebookRemote = useRefreshNotebookRemoteSources();
  const refreshRemoteSource = useRefreshRemoteSource();
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  const handleGoogleDriveFiles = useCallback(
    async (files: PickedFile[], accessToken: string) => {
      if (!noteId) return;

      for (const file of files) {
        try {
          const result = await ingestFromDrive({
            notebookId: noteId,
            fileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType,
            accessToken,
          });
          onDocumentUploaded?.(result.documentId);
        } catch (err) {
          console.error("Google Drive upload failed:", err);
          showError(
            err instanceof Error ? err.message : `Failed to import "${file.name}" from Google Drive`
          );
        }
      }
    },
    [noteId, ingestFromDrive, onDocumentUploaded, showError]
  );

  // Custom hooks
  const sourceUpload = useSourceUpload({
    sourcesCount: sources.length,
    userId,
    noteId,
    onDocumentUploaded,
  });

  const { searchQuery, setSearchQuery, filteredSources } = useSourceSearch(sources);

  // Fetch document content using the reactive hook
  const viewingSource = useMemo(
    () => sources.find((s) => s.id === viewingSourceId) || null,
    [sources, viewingSourceId]
  );

  const contentReady = viewingSource?.status === "completed";
  const documentContent = useDocumentContent(contentReady ? viewingSourceId : null);
  const viewingDocument = useDocument(viewingSourceId);
  const markdownContent = useMemo(
    () => (documentContent?.content ? normalizeNewlines(documentContent.content) : undefined),
    [documentContent]
  );
  const isContentLoading = contentReady && documentContent === undefined;

  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  useEffect(() => {
    if (!focusSourceRequest) return;
    if (sources.length === 0) return;
    const { documentId } = focusSourceRequest;
    const exists = sources.some((s) => s.id === documentId);
    if (exists) {
      setViewingSourceId(documentId);
    }
    onFocusSourceHandled?.();
  }, [focusSourceRequest, sources, onFocusSourceHandled]);

  // Computed values
  const allSelected = filteredSources.length > 0 && filteredSources.every((s) => s.selected);
  const selectedCount = sources.filter((s) => s.selected).length;

  const canCopyOrDownload = Boolean(markdownContent);

  // Handlers
  const handleDeleteSource = async (sourceId: string, sourceTitle: string) => {
    const confirmed = await confirm(
      "Delete Source",
      `Are you sure you want to delete "${sourceTitle}"? This action cannot be undone.`,
      { confirmText: "Delete", cancelText: "Cancel", variant: "danger" }
    );
    if (confirmed) {
      onDeleteSource(sourceId);
    }
  };

  const handleDeleteSelected = async () => {
    const ids = sources.filter((s) => s.selected).map((s) => s.id);
    if (ids.length === 0) return;
    const confirmed = await confirm(
      "Delete sources",
      `Delete ${ids.length} selected source${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      { confirmText: "Delete", cancelText: "Cancel", variant: "danger" }
    );
    if (confirmed) {
      await onDeleteSelectedSources(ids);
    }
  };

  const canRefreshAll = useMemo(() => sources.some((s) => s.remoteRefreshKind), [sources]);

  const handleRefreshAll = useCallback(async () => {
    if (!noteId || isRefreshingAll || !canRefreshAll) return;
    const refreshableCount = sources.filter((s) => s.remoteRefreshKind).length;
    const confirmed = await confirm(
      "Refresh sources",
      `Re-fetch ${refreshableCount} remote source${refreshableCount === 1 ? "" : "s"}? Web pages and Google Drive imports will be updated.`,
      { confirmText: "Refresh", cancelText: "Cancel", variant: "default" }
    );
    if (!confirmed) return;
    setIsRefreshingAll(true);
    try {
      const needsDrive = sources.some((s) => s.remoteRefreshKind === "drive");
      let accessToken: string | undefined;
      if (needsDrive) {
        try {
          accessToken = await requestGoogleDriveAccessToken();
        } catch (e) {
          console.warn("Google token not obtained; Drive sources may be skipped.", e);
        }
      }
      const result = await refreshNotebookRemote({
        notebookId: noteId,
        accessToken,
      });
      const parts: string[] = [];
      if (result.urlCount > 0) {
        parts.push(`${result.urlCount} web page${result.urlCount === 1 ? "" : "s"} queued`);
      }
      if (result.driveRefreshed > 0) {
        parts.push(`${result.driveRefreshed} from Google Drive`);
      }
      if (result.driveSkippedNoToken > 0) {
        parts.push(
          `${result.driveSkippedNoToken} Drive source${result.driveSkippedNoToken === 1 ? "" : "s"} skipped (sign in with Google to refresh)`
        );
      }
      if (parts.length === 0) {
        showInfo("No web or Google Drive sources to refresh in this notebook.");
      } else {
        success(`Refresh started: ${parts.join(". ")}.`);
      }
    } catch (err) {
      console.error("Refresh all failed:", err);
      showError(err instanceof Error ? err.message : "Failed to refresh sources");
    } finally {
      setIsRefreshingAll(false);
    }
  }, [
    noteId,
    isRefreshingAll,
    canRefreshAll,
    sources,
    confirm,
    refreshNotebookRemote,
    success,
    showInfo,
    showError,
  ]);

  const handleRefreshSource = useCallback(
    async (sourceId: string) => {
      const source = sources.find((s) => s.id === sourceId);
      if (!source?.remoteRefreshKind) return;
      try {
        let accessToken: string | undefined;
        if (source.remoteRefreshKind === "drive") {
          accessToken = await requestGoogleDriveAccessToken();
        }
        await refreshRemoteSource({
          documentId: sourceId,
          accessToken,
        });
        showInfo("Refresh started for this source.");
      } catch (err) {
        console.error("Refresh source failed:", err);
        showError(err instanceof Error ? err.message : "Failed to refresh source");
      }
    },
    [sources, refreshRemoteSource, showInfo, showError]
  );

  const handleToggleSource = (sourceId: string) => {
    onToggleSource(sourceId);
  };

  const handleViewSource = (sourceId: string) => {
    setViewingSourceId(sourceId);
  };

  const handleRenameSource = (id: string, newTitle: string) => {
    onRenameSource(id, newTitle);
    setRenamingId(null);
  };

  const handleMenuOpenChange = (id: string, open: boolean) => {
    setOpenMenuId(open ? id : (prev) => (prev === id ? null : prev));
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const handleStartRename = (sourceId: string) => {
    const source = sources.find((s) => s.id === sourceId);
    if (source) {
      setRenamingId(sourceId);
      setRenameValue(source.title);
      setOpenMenuId(null);
    }
  };

  const handleBackToList = () => {
    setViewingSourceId(null);
    setRenamingId(null);
  };

  const handleEnterRename = () => {
    if (viewingSource) {
      setRenamingId(viewingSource.id);
      setRenameValue(viewingSource.title);
    }
  };

  const handleExitRename = () => {
    setRenamingId(null);
  };

  const handleCopy = async () => {
    if (markdownContent) await copySourceMarkdown(markdownContent);
  };

  const handleDownload = () => {
    if (viewingSource && markdownContent) {
      downloadSourceMarkdown(markdownContent, viewingSource.title);
    }
  };

  return (
    <>
      <div
        className={`
          relative h-full w-full min-w-0 bg-sidebar flex flex-col
          overflow-hidden
          ${isOpen ? "opacity-100" : "opacity-0"}
        `}
      >
        <SourcesPanelHeader
          viewingSource={viewingSource}
          onBackToList={handleBackToList}
          onEnterRename={handleEnterRename}
          onExitRename={handleExitRename}
          onClose={onClose}
          selectedCount={selectedCount}
          onCopy={handleCopy}
          onDownload={handleDownload}
          canCopyOrDownload={canCopyOrDownload}
          isRenaming={viewingSource ? renamingId === viewingSource.id : false}
          renameValue={renameValue}
          onRenameChange={setRenameValue}
          onRenameSubmit={handleRenameSource}
        />

        <div className="flex-1 overflow-y-auto w-full">
          {viewingSource ? (
            <SourceViewer
              source={viewingSource}
              content={markdownContent}
              pdfStorageId={viewingSource?.type === "PDF" ? viewingDocument?.storageId : undefined}
              isLoading={isContentLoading}
              onDiscussTopic={onDiscussTopic}
            />
          ) : (
            <SourceList
              sources={sources}
              filteredSources={filteredSources}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onToggleAll={() => onToggleAll(filteredSources.map((s) => s.id))}
              onToggleSource={handleToggleSource}
              onViewSource={handleViewSource}
              onDeleteSource={handleDeleteSource}
              onRefreshSource={handleRefreshSource}
              onRenameSource={handleRenameSource}
              allSelected={allSelected}
              renamingId={renamingId}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              openMenuId={openMenuId}
              onMenuOpenChange={handleMenuOpenChange}
              onRenameCancel={handleRenameCancel}
              onStartRename={handleStartRename}
              onAddSource={() => setIsAddModalOpen(true)}
              onDiscoverClick={() => setIsDiscoverOpen(true)}
              selectedCount={selectedCount}
              onDeleteSelected={handleDeleteSelected}
              onRefreshAll={handleRefreshAll}
              canRefreshAll={canRefreshAll}
              isRefreshing={isRefreshingAll}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <AddSourceDialog
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        sourcesCount={sources.length}
        userId={userId}
        noteId={noteId}
        upload={sourceUpload}
        onDiscoverClick={() => setIsDiscoverOpen(true)}
        onGoogleDriveClick={() => googleDriveRef.current?.open()}
      />

      <DiscoverSourcesDialog
        open={isDiscoverOpen}
        onOpenChange={setIsDiscoverOpen}
        notebookSources={sources}
        userId={userId}
        noteId={noteId}
        onDocumentUploaded={onDocumentUploaded}
        onAddSourcesClick={() => {
          setIsDiscoverOpen(false);
          setIsAddModalOpen(true);
        }}
      />

      {isGoogleDrivePickerConfigured ? (
        <GoogleDrivePicker ref={googleDriveRef} onFilesSelected={handleGoogleDriveFiles} />
      ) : null}
      <ConfirmDialogComponent />
    </>
  );
};
