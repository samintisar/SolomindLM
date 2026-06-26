import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AudioPlayerProvider } from "@/features/audio/AudioPlayerContext";

import { useAuth } from "@/features/auth/useAuth";
import { ChatPanel } from "@/features/chat/components/ChatPanel";
import { useChatStreamingContext } from "@/features/chat/useChatStreaming";
import { useNotebookContext } from "@/features/notebooks/useNotebookContext";
import {
  SourcesPanel,
  type SourcesPanelFocusRequest,
} from "@/features/sources/components/SourcesPanel";
import { useSourcesContext } from "@/features/sources/useSourcesContext";
import { LiteraturePapersPanel } from "@/features/studio/components/LiteraturePapersPanel";
import { LiteratureScreeningPanel } from "@/features/studio/components/LiteratureScreeningPanel";
import { LiteratureStudioView } from "@/features/studio/components/LiteratureStudioView";
import { StudioPanel } from "@/features/studio/components/StudioPanel";
import type { ActiveLiteratureView } from "@/features/studio/types/literatureStudio";
import { useStudioContext } from "@/features/studio/useStudioContext";
import { STUDIO_TOOLS } from "@/shared/constants";
import { useToast } from "@/shared/contexts/useToast";
import { usePanelResize } from "@/shared/hooks/usePanelResize";


export function NotebookView() {
  const { user } = useAuth();

  const location = useLocation();

  const navigate = useNavigate();

  const { urlNotebookId, notebookTitle, activeNotebook } = useNotebookContext();

  const { sources } = useSourcesContext();

  const { notes } = useStudioContext();

  const {
    onSendMessage,

    isChatStreaming,

    remoteGenerationBlocksSend,
  } = useChatStreamingContext();

  const { error: toastError } = useToast();

  const {
    leftWidth,

    rightWidth,

    isResizingLeft,

    isResizingRight,

    startResizingLeft,

    startResizingRight,
  } = usePanelResize();

  const [mobileActiveTab, setMobileActiveTab] = useState<"sources" | "chat" | "studio">("sources");

  const [isSourcesOpen, setIsSourcesOpen] = useState(true);

  const [isStudioOpen, setIsStudioOpen] = useState(true);

  const [sourceFocusRequest, setSourceFocusRequest] = useState<SourcesPanelFocusRequest | null>(
    null
  );

  const [activeLiteratureView, setActiveLiteratureView] = useState<ActiveLiteratureView | null>(
    null
  );
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    const tableId = params.get("literatureTable");

    const reportId = params.get("literatureReport");

    if (!tableId && !reportId) return;

    if (tableId) {
      setActiveLiteratureView({ kind: "table", tableId: tableId as Id<"literatureTables"> });
    } else if (reportId) {
      setActiveLiteratureView({ kind: "report", reportId: reportId as Id<"literatureReports"> });
    }

    setIsStudioOpen(true);

    setMobileActiveTab("studio");

    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const handleOpenLiteratureTable = useCallback((tableId: Id<"literatureTables">) => {
    setActiveLiteratureView({ kind: "table", tableId });

    setIsStudioOpen(true);

    setMobileActiveTab("studio");
  }, []);

  const handleOpenLiteratureReport = useCallback((reportId: Id<"literatureReports">) => {
    setActiveLiteratureView({ kind: "report", reportId });

    setIsStudioOpen(true);

    setMobileActiveTab("studio");
  }, []);

  const handleOpenRankedPapers = useCallback((sessionId: Id<"literatureReviewSessions">) => {
    setActiveLiteratureView({ kind: "papers", sessionId });

    setIsStudioOpen(true);

    setMobileActiveTab("studio");
  }, []);

  const handleOpenScreeningDecisions = useCallback((sessionId: Id<"literatureReviewSessions">) => {
    setActiveLiteratureView({ kind: "screening", sessionId });

    setIsStudioOpen(true);

    setMobileActiveTab("studio");
  }, []);

  const handleCloseLiteratureView = useCallback(() => {
    setActiveLiteratureView(null);
  }, []);

  const handleOpenSavedReport = useCallback((reportId: Id<"reports">) => {
    window.dispatchEvent(new CustomEvent("setActiveNote", { detail: { noteId: reportId } }));
    setActiveLiteratureView(null);
    setIsStudioOpen(true);
    setMobileActiveTab("studio");
  }, []);

  const handleOpenSavedSpreadsheet = useCallback((spreadsheetId: Id<"spreadsheets">) => {
    window.dispatchEvent(new CustomEvent("setActiveNote", { detail: { noteId: spreadsheetId } }));
    setActiveLiteratureView(null);
    setIsStudioOpen(true);
    setMobileActiveTab("studio");
  }, []);

  const toggleSources = () => setIsSourcesOpen(!isSourcesOpen);

  const toggleStudio = useCallback(() => setIsStudioOpen((isOpen) => !isOpen), []);

  const renderRightPanel = useCallback(() => {
    if (!isStudioOpen || !urlNotebookId) return null;

    if (activeLiteratureView?.kind === "papers") {
      return (
        <LiteraturePapersPanel
          sessionId={activeLiteratureView.sessionId}
          notebookId={urlNotebookId as Id<"notebooks">}
          width={rightWidth}
          isResizing={isResizingRight}
          onClose={handleCloseLiteratureView}
        />
      );
    }

    if (activeLiteratureView?.kind === "screening") {
      return (
        <LiteratureScreeningPanel
          sessionId={activeLiteratureView.sessionId}
          width={rightWidth}
          isResizing={isResizingRight}
          onClose={handleCloseLiteratureView}
        />
      );
    }

    if (activeLiteratureView?.kind === "table" || activeLiteratureView?.kind === "report") {
      return (
        <LiteratureStudioView
          view={activeLiteratureView}
          width={rightWidth}
          notebookId={urlNotebookId as Id<"notebooks">}
          onClose={handleCloseLiteratureView}
          onOpenSavedReport={handleOpenSavedReport}
          onOpenSavedSpreadsheet={handleOpenSavedSpreadsheet}
        />
      );
    }

    return (
      <StudioPanel
        isOpen={isStudioOpen}
        onClose={toggleStudio}
        tools={STUDIO_TOOLS}
        width={rightWidth}
        isResizing={isResizingRight}
        sources={sources}
        notebookId={urlNotebookId}
      />
    );
  }, [
    activeLiteratureView,

    handleCloseLiteratureView,
    handleOpenSavedReport,
    handleOpenSavedSpreadsheet,

    isResizingRight,

    isStudioOpen,

    rightWidth,

    sources,
    toggleStudio,

    urlNotebookId,
  ]);

  // Mini Audio Player state

  const [miniPlayerVisible, setMiniPlayerVisible] = useState(false);

  const [miniPlayerData, setMiniPlayerData] = useState<{
    audioUrl: string;

    title: string;

    transcript?: string;

    audioOverviewId?: string;
  } | null>(null);

  const clearSourceFocusRequest = useCallback(() => {
    setSourceFocusRequest(null);
  }, []);

  const handleOpenNotebookSourceFromChat = useCallback((documentId: string) => {
    setIsSourcesOpen(true);

    setMobileActiveTab("sources");

    setSourceFocusRequest((prev) => ({
      documentId,

      seq: (prev?.seq ?? 0) + 1,
    }));
  }, []);

  const handleDiscussSourceTopic = useCallback(
    (topic: string) => {
      const trimmed = topic.trim();

      if (!trimmed) return;

      if (!urlNotebookId || isChatStreaming || remoteGenerationBlocksSend) return;

      const selectedCompletedSources = sources.filter(
        (source) => source.status === "completed" && source.selected
      );

      if (selectedCompletedSources.length === 0) {
        toastError("Please select at least one source before asking a question");

        return;
      }

      setMobileActiveTab("chat");

      onSendMessage(`Discuss ${trimmed.toLowerCase()}`, undefined, { channels: ["notebook"] });
    },
    [isChatStreaming, onSendMessage, remoteGenerationBlocksSend, sources, toastError, urlNotebookId]
  );

  const handlePlayAudio = useCallback(
    (
      audioUrl: string,

      title: string,

      transcript?: string,

      noteId?: string,

      audioOverviewId?: string
    ) => {
      setMiniPlayerData({ audioUrl, title, transcript, audioOverviewId });

      setMiniPlayerVisible(true);

      if (noteId) {
        (window as any).__currentPlayingAudioNoteId = noteId;
      }
    },

    []
  );

  const handleCloseMiniPlayer = useCallback(() => {
    setMiniPlayerVisible(false);
  }, []);

  const handleExpandAudioPlayer = useCallback(() => {
    setMiniPlayerVisible(false);

    const noteId = (window as any).__currentPlayingAudioNoteId;

    if (noteId) {
      const note = notes.find((n) => n.id === noteId);

      if (note) {
        const event = new CustomEvent("setActiveNote", { detail: { noteId } });

        window.dispatchEvent(event);
      }
    }
  }, [notes]);

  const audioPlayerContextValue = useMemo(
    () => ({
      miniPlayerVisible,

      miniPlayerData,

      onPlayAudio: handlePlayAudio,

      onCloseMiniPlayer: handleCloseMiniPlayer,

      onExpandAudioPlayer: handleExpandAudioPlayer,
    }),

    [
      miniPlayerVisible,
      miniPlayerData,
      handlePlayAudio,
      handleCloseMiniPlayer,
      handleExpandAudioPlayer,
    ]
  );

  const mobileRightPanel = useMemo(() => {
    if (!urlNotebookId) return null;

    if (activeLiteratureView?.kind === "papers") {
      return (
        <LiteraturePapersPanel
          sessionId={activeLiteratureView.sessionId}
          notebookId={urlNotebookId as Id<"notebooks">}
          width={390}
          isResizing={false}
          onClose={handleCloseLiteratureView}
        />
      );
    }

    if (activeLiteratureView?.kind === "screening") {
      return (
        <LiteratureScreeningPanel
          sessionId={activeLiteratureView.sessionId}
          width={390}
          isResizing={false}
          onClose={handleCloseLiteratureView}
        />
      );
    }

    if (activeLiteratureView?.kind === "table" || activeLiteratureView?.kind === "report") {
      return (
        <LiteratureStudioView
          view={activeLiteratureView}
          width={390}
          notebookId={urlNotebookId as Id<"notebooks">}
          onClose={handleCloseLiteratureView}
          onOpenSavedReport={handleOpenSavedReport}
          onOpenSavedSpreadsheet={handleOpenSavedSpreadsheet}
        />
      );
    }

    return (
      <StudioPanel
        isOpen={true}
        onClose={() => undefined}
        tools={STUDIO_TOOLS}
        width={390}
        isResizing={false}
        sources={sources}
        notebookId={urlNotebookId}
      />
    );
  }, [
    activeLiteratureView,
    handleCloseLiteratureView,
    handleOpenSavedReport,
    handleOpenSavedSpreadsheet,
    sources,
    urlNotebookId,
  ]);

  return (
    <AudioPlayerProvider value={audioPlayerContextValue}>
      <main className="flex-1 flex flex-col overflow-hidden relative animate-in fade-in duration-300">
        {/* Mobile panel tabs (below app header on all viewports) */}
        <div className="md:hidden sticky top-0 z-60 flex h-12 items-center justify-around border-b border-border bg-background">
          <button
            onClick={() => setMobileActiveTab("sources")}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
              mobileActiveTab === "sources"
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sources
          </button>

          <div className="w-px h-6 bg-border"></div>

          <button
            onClick={() => setMobileActiveTab("chat")}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
              mobileActiveTab === "chat"
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Chat
          </button>

          <div className="w-px h-6 bg-border"></div>

          <button
            data-onboarding="studio-panel-toggle"
            onClick={() => setMobileActiveTab("studio")}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
              mobileActiveTab === "studio"
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Studio
          </button>
        </div>

        {/* Desktop Layout */}

        <div className="hidden md:flex min-h-0 min-w-0 w-full flex-1 overflow-x-auto overflow-y-hidden">
          <SourcesPanel
            isOpen={isSourcesOpen}
            onClose={toggleSources}
            width={leftWidth}
            isResizing={isResizingLeft}
            userId={user?.id}
            noteId={urlNotebookId}
            onDocumentUploaded={() => undefined}
            focusSourceRequest={sourceFocusRequest}
            onFocusSourceHandled={clearSourceFocusRequest}
            onDiscussTopic={handleDiscussSourceTopic}
          />

          {isSourcesOpen && (
            <div
              className="w-1 hover:w-1.5 -ml-0.5 z-50 cursor-col-resize shrink-0 hover:bg-primary/50 transition-colors select-none"
              onMouseDown={startResizingLeft}
            />
          )}

          <div className="flex min-h-0 min-w-70 flex-1 flex-col overflow-hidden">
            <ChatPanel
              isLeftOpen={isSourcesOpen}
              isRightOpen={isStudioOpen}
              toggleLeft={toggleSources}
              toggleRight={toggleStudio}
              notebookId={urlNotebookId as Id<"notebooks"> | null}
              notebookTitle={notebookTitle}
              notebookIcon={activeNotebook?.icon}
              notebookCoverColor={activeNotebook?.coverColor}
              chatSettings={activeNotebook?.chatSettings}
              onOpenNotebookSource={handleOpenNotebookSourceFromChat}
              onOpenLiteratureTable={handleOpenLiteratureTable}
              onOpenLiteratureReport={handleOpenLiteratureReport}
              onOpenRankedPapers={handleOpenRankedPapers}
              onOpenScreeningDecisions={handleOpenScreeningDecisions}
            />
          </div>

          {isStudioOpen && (
            <div
              className="w-1 hover:w-1.5 -mr-0.5 z-50 cursor-col-resize shrink-0 hover:bg-primary/50 transition-colors select-none"
              onMouseDown={startResizingRight}
            />
          )}

          {renderRightPanel()}
        </div>

        {/* Mobile Layout */}

        <div className="md:hidden flex flex-1 w-full flex-col overflow-hidden">
          {mobileActiveTab === "sources" && (
            <div className="flex-1 w-full overflow-hidden">
              <SourcesPanel
                isOpen={true}
                onClose={() => undefined}
                width={390}
                isResizing={false}
                userId={user?.id}
                noteId={urlNotebookId}
                onDocumentUploaded={() => undefined}
                focusSourceRequest={sourceFocusRequest}
                onFocusSourceHandled={clearSourceFocusRequest}
                onDiscussTopic={handleDiscussSourceTopic}
              />
            </div>
          )}

          {mobileActiveTab === "chat" && (
            <div className="flex-1 w-full overflow-hidden">
              <ChatPanel
                isLeftOpen={false}
                isRightOpen={false}
                toggleLeft={() => undefined}
                toggleRight={() => undefined}
                notebookId={urlNotebookId}
                notebookTitle={notebookTitle}
                notebookIcon={activeNotebook?.icon}
                notebookCoverColor={activeNotebook?.coverColor}
                chatSettings={activeNotebook?.chatSettings}
                onOpenNotebookSource={handleOpenNotebookSourceFromChat}
                onOpenLiteratureTable={handleOpenLiteratureTable}
                onOpenLiteratureReport={handleOpenLiteratureReport}
                onOpenRankedPapers={handleOpenRankedPapers}
                onOpenScreeningDecisions={handleOpenScreeningDecisions}
              />
            </div>
          )}

          {mobileActiveTab === "studio" && (
            <div className="flex-1 w-full overflow-hidden">{mobileRightPanel}</div>
          )}
        </div>
      </main>
    </AudioPlayerProvider>
  );
}
