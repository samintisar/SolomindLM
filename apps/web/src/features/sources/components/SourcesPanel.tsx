import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSourcesContext } from "../useSourcesContext";
import { DiscoverSourcesModal } from "./DiscoverSourcesModal";
import { AddSourceModal } from "./AddSourceModal";
import { UrlInputModal } from "./UrlInputModal";
import { SocialMediaInputModal } from "./SocialMediaInputModal";
import { TextInputModal } from "./TextInputModal";
import { GoogleDrivePicker } from "./GoogleDrivePicker";
import type { GoogleDrivePickerHandle, PickedFile } from "./GoogleDrivePicker";
import { SourceList } from "./SourceList";
import { SourceViewer } from "./SourceViewer";
import { SourcesPanelHeader } from "./SourcesPanelHeader";
import { useSourceUpload } from "../hooks/useSourceUpload";
import { useSourceContent } from "../hooks/useSourceContent";
import { useSourceSearch } from "../hooks/useSourceSearch";
import {
  useDocumentContent,
  useDocument,
  useIngestFromGoogleDrive,
  useRefreshNotebookRemoteSources,
  useRefreshRemoteSource,
} from "../services/documentsApi";
import { requestGoogleDriveAccessToken } from "../utils/requestGoogleDriveAccessToken";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { useToast } from "@/shared/contexts/useToast";

export type SourcesPanelFocusRequest = { documentId: string; seq: number };

interface SourcesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  width: number;
  isResizing: boolean;
  userId?: string | null;
  noteId?: string | null;
  onDocumentUploaded?: (documentId: string) => void;
  /** Open this notebook document in the viewer (e.g. citation click). `seq` bumps so the same id can reopen. */
  focusSourceRequest?: SourcesPanelFocusRequest | null;
  onFocusSourceHandled?: () => void;
}

export const SourcesPanel: React.FC<SourcesPanelProps> = ({
  isOpen,
  onClose,
  width,
  userId,
  noteId,
  onDocumentUploaded,
  focusSourceRequest,
  onFocusSourceHandled,
}) => {
  const {
    sources,
    onToggleSource,
    onToggleAll,
    onAddSource,
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
  const [isMobile, setIsMobile] = useState(false);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showSocialMediaInput, setShowSocialMediaInput] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);

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

  const sourceContent = useSourceContent();

  // Fetch document content using the reactive hook
  const viewingSource = useMemo(
    () => sources.find((s) => s.id === viewingSourceId) || null,
    [sources, viewingSourceId]
  );

  const documentContent = useDocumentContent(
    viewingSource && viewingSource.status === "completed" ? viewingSourceId : null
  );
  const viewingDocument = useDocument(viewingSourceId);

  // Refs to avoid effect depending on sourceContent (which is a new object every render and would cause infinite loop)
  const onContentUpdateRef = useRef(sourceContent.onContentUpdate);
  const onLoadingStartRef = useRef(sourceContent.onLoadingStart);
  // eslint-disable-next-line react-hooks/refs
  onContentUpdateRef.current = sourceContent.onContentUpdate;
  // eslint-disable-next-line react-hooks/refs
  onLoadingStartRef.current = sourceContent.onLoadingStart;

  // Update content cache when documentContent changes
  useEffect(() => {
    if (viewingSourceId && documentContent?.content) {
      onContentUpdateRef.current(viewingSourceId, documentContent.content);
    } else if (
      viewingSourceId &&
      viewingSource?.status === "completed" &&
      documentContent === undefined
    ) {
      onLoadingStartRef.current(viewingSourceId);
    }
  }, [viewingSourceId, documentContent, viewingSource?.status]);

  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!focusSourceRequest) return;
    if (sources.length === 0) return;
    const { documentId } = focusSourceRequest;
    const exists = sources.some((s) => s.id === documentId);
    if (exists) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewingSourceId(documentId);
    }
    onFocusSourceHandled?.();
  }, [focusSourceRequest, sources, onFocusSourceHandled]);

  // Computed values
  const allSelected = filteredSources.length > 0 && filteredSources.every((s) => s.selected);
  const selectedCount = sources.filter((s) => s.selected).length;

  const markdownContent = viewingSourceId ? sourceContent.getContent(viewingSourceId) : undefined;
  const canCopyOrDownload = Boolean(
    markdownContent && !sourceContent.hasError(viewingSourceId ?? "")
  );

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

  const handleMenuOpen = (id: string) => {
    if (renamingId !== null) {
      // Save rename if active
      if (renameValue.trim()) {
        handleRenameSource(renamingId, renameValue);
      }
      setRenamingId(null);
    }
    setOpenMenuId(id === openMenuId ? null : id);
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
    if (viewingSource) {
      await sourceContent.handleCopySourceMarkdown(viewingSource.id, viewingSource.title);
    }
  };

  const handleDownload = () => {
    if (viewingSource) {
      sourceContent.handleDownloadSourceMarkdown(viewingSource.id, viewingSource.title);
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = width;
    let animationFrameId: number | null = null;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        const delta = moveEvent.clientX - startX;
        const maxWidth = Math.min(window.innerWidth * 0.7, 1400);
        const newWidth = Math.max(220, Math.min(maxWidth, startWidth + delta));
        window.dispatchEvent(
          new CustomEvent("resizeSourcesPanel", { detail: { width: newWidth } })
        );
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <>
      <div
        style={{
          width: isOpen ? (isMobile ? "100%" : width) : 0,
        }}
        className={`
          relative shrink-0 bg-sidebar border-r-2 border-border h-full flex flex-col
          overflow-hidden
          ${isOpen ? "opacity-100" : "opacity-0"}
          md:w-auto w-full max-w-full
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
          onResizeStart={handleResizeStart}
        />

        <div className="flex-1 overflow-y-auto w-full">
          {viewingSource ? (
            <SourceViewer
              source={viewingSource}
              onToggle={handleToggleSource}
              content={markdownContent}
              pdfStorageId={viewingSource?.type === "PDF" ? viewingDocument?.storageId : undefined}
              isLoading={sourceContent.isLoading(viewingSourceId ?? "")}
              error={
                sourceContent.hasError(viewingSourceId ?? "") ? "Failed to load content" : undefined
              }
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
              onMenuOpen={handleMenuOpen}
              onStartRename={handleStartRename}
              width={width}
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
      <AddSourceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onFileUpload={sourceUpload.processFiles}
        onUrlClick={() => {
          setIsAddModalOpen(false);
          setShowUrlInput(true);
        }}
        onSocialMediaClick={() => {
          setIsAddModalOpen(false);
          setShowSocialMediaInput(true);
        }}
        onTextClick={() => {
          setIsAddModalOpen(false);
          setShowTextInput(true);
        }}
        onDiscoverClick={() => {
          setIsAddModalOpen(false);
          setIsDiscoverOpen(true);
        }}
        onGoogleDriveClick={() => {
          setIsAddModalOpen(false);
          googleDriveRef.current?.open();
        }}
        isDragging={sourceUpload.isDragging}
        onDragEnter={sourceUpload.handleDragEnter}
        onDragLeave={sourceUpload.handleDragLeave}
        onDragOver={sourceUpload.handleDragOver}
        onDrop={sourceUpload.handleDrop}
        sourcesCount={sources.length}
        userId={userId}
        noteId={noteId}
        isUploading={sourceUpload.isUploading}
        fileInputRef={sourceUpload.fileInputRef}
        onFileSelect={sourceUpload.handleFileSelect}
      />

      <UrlInputModal
        isOpen={showUrlInput}
        onClose={() => setShowUrlInput(false)}
        onUpload={sourceUpload.handleUrlUpload}
        isUploading={sourceUpload.isUploading}
      />

      <SocialMediaInputModal
        isOpen={showSocialMediaInput}
        onClose={() => setShowSocialMediaInput(false)}
        onUpload={sourceUpload.handleSocialMediaUpload}
        isUploading={sourceUpload.isUploading}
      />

      <TextInputModal
        isOpen={showTextInput}
        onClose={() => setShowTextInput(false)}
        onUpload={sourceUpload.handleTextUpload}
        isUploading={sourceUpload.isUploading}
      />

      <DiscoverSourcesModal
        isOpen={isDiscoverOpen}
        onClose={() => setIsDiscoverOpen(false)}
        onAddSource={onAddSource}
        notebookSources={sources}
        isAtLimit={sources.length >= 100}
        userId={userId}
        noteId={noteId}
        onDocumentUploaded={onDocumentUploaded}
        onAddSourcesClick={() => {
          setIsDiscoverOpen(false);
          setIsAddModalOpen(true);
        }}
      />

      <GoogleDrivePicker ref={googleDriveRef} onFilesSelected={handleGoogleDriveFiles} />
      <ConfirmDialogComponent />
    </>
  );
};
