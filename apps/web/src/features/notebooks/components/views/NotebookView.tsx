import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { useNotebookContext } from "@/features/notebooks/NotebookContext";
import { useSourcesContext } from "@/features/sources/SourcesContext";
import { useStudioContext } from "@/features/studio/StudioContext";
import { AudioPlayerProvider } from "@/features/audio/AudioPlayerContext";
import { usePanelResize } from "@/shared/hooks/usePanelResize";
import {
  SourcesPanel,
  type SourcesPanelFocusRequest,
} from "@/features/sources/components/SourcesPanel";
import { ChatPanel } from "@/features/chat/components/ChatPanel";
import { StudioPanel } from "@/features/studio/components/StudioPanel";
import { STUDIO_TOOLS } from "@/shared/constants";
import { isNativeShell } from "@/utils/platformDetection";

export function NotebookView() {
  const { user } = useAuth();
  const { urlNotebookId, notebookTitle, activeNotebook } = useNotebookContext();
  const { sources } = useSourcesContext();
  const { notes } = useStudioContext();

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

  // Mini Audio Player state
  const [miniPlayerVisible, setMiniPlayerVisible] = useState(false);
  const [miniPlayerData, setMiniPlayerData] = useState<{
    audioUrl: string;
    title: string;
    transcript?: string;
    audioOverviewId?: string;
  } | null>(null);

  const toggleSources = () => setIsSourcesOpen(!isSourcesOpen);
  const toggleStudio = () => setIsStudioOpen(!isStudioOpen);

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

  const handlePlayAudio = (
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
  };

  const handleCloseMiniPlayer = () => {
    setMiniPlayerVisible(false);
  };

  const handleExpandAudioPlayer = () => {
    setMiniPlayerVisible(false);
    const noteId = (window as any).__currentPlayingAudioNoteId;
    if (noteId) {
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        const event = new CustomEvent("setActiveNote", { detail: { noteId } });
        window.dispatchEvent(event);
      }
    }
  };

  const audioPlayerContextValue = useMemo(
    () => ({
      miniPlayerVisible,
      miniPlayerData,
      onPlayAudio: handlePlayAudio,
      onCloseMiniPlayer: handleCloseMiniPlayer,
      onExpandAudioPlayer: handleExpandAudioPlayer,
    }),
    [miniPlayerVisible, miniPlayerData]
  );

  return (
    <AudioPlayerProvider value={audioPlayerContextValue}>
      <main className="flex-1 flex flex-col overflow-hidden relative animate-in fade-in duration-300">
        {/* Mobile panel tabs: top on web; bottom-fixed in native shell so it clears the native tab bar */}
        <div
          className={`md:hidden flex items-center justify-around border-border bg-background z-60 h-12 ${
            isNativeShell()
              ? "fixed bottom-0 left-0 right-0 border-t pb-[env(safe-area-inset-bottom,0px)]"
              : "sticky top-0 border-b"
          }`}
        >
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
        <div className="hidden md:flex flex-1 overflow-hidden w-full">
          <SourcesPanel
            isOpen={isSourcesOpen}
            onClose={toggleSources}
            width={leftWidth}
            isResizing={isResizingLeft}
            userId={user?.id}
            noteId={urlNotebookId}
            onDocumentUploaded={() => {}}
            focusSourceRequest={sourceFocusRequest}
            onFocusSourceHandled={clearSourceFocusRequest}
          />

          {isSourcesOpen && (
            <div
              className="w-1 hover:w-1.5 -ml-0.5 z-50 cursor-col-resize shrink-0 hover:bg-primary/50 transition-colors select-none"
              onMouseDown={startResizingLeft}
            />
          )}

          <ChatPanel
            isLeftOpen={isSourcesOpen}
            isRightOpen={isStudioOpen}
            toggleLeft={toggleSources}
            toggleRight={toggleStudio}
            notebookId={urlNotebookId}
            notebookTitle={notebookTitle}
            notebookIcon={activeNotebook?.icon}
            notebookCoverColor={activeNotebook?.coverColor}
            chatSettings={activeNotebook?.chatSettings}
            onOpenNotebookSource={handleOpenNotebookSourceFromChat}
          />

          {isStudioOpen && (
            <div
              className="w-1 hover:w-1.5 -mr-0.5 z-50 cursor-col-resize shrink-0 hover:bg-primary/50 transition-colors select-none"
              onMouseDown={startResizingRight}
            />
          )}

          <StudioPanel
            isOpen={isStudioOpen}
            onClose={toggleStudio}
            tools={STUDIO_TOOLS}
            width={rightWidth}
            isResizing={isResizingRight}
            sources={sources}
            userId={user?.id}
            noteId={urlNotebookId}
          />
        </div>

        {/* Mobile Layout */}
        <div
          className={`md:hidden flex-1 overflow-hidden w-full flex flex-col ${
            isNativeShell() ? "pb-[calc(3rem+env(safe-area-inset-bottom,0px))]" : ""
          }`}
        >
          {mobileActiveTab === "sources" && (
            <div className="flex-1 w-full overflow-hidden">
              <SourcesPanel
                isOpen={true}
                onClose={() => {}}
                width={390}
                isResizing={false}
                userId={user?.id}
                noteId={urlNotebookId}
                onDocumentUploaded={() => {}}
                focusSourceRequest={sourceFocusRequest}
                onFocusSourceHandled={clearSourceFocusRequest}
              />
            </div>
          )}
          {mobileActiveTab === "chat" && (
            <div className="flex-1 w-full overflow-hidden">
              <ChatPanel
                isLeftOpen={false}
                isRightOpen={false}
                toggleLeft={() => {}}
                toggleRight={() => {}}
                notebookId={urlNotebookId}
                notebookTitle={notebookTitle}
                notebookIcon={activeNotebook?.icon}
                notebookCoverColor={activeNotebook?.coverColor}
                chatSettings={activeNotebook?.chatSettings}
                onOpenNotebookSource={handleOpenNotebookSourceFromChat}
              />
            </div>
          )}
          {mobileActiveTab === "studio" && (
            <div className="flex-1 w-full overflow-hidden">
              <StudioPanel
                isOpen={true}
                onClose={() => {}}
                tools={STUDIO_TOOLS}
                width={390}
                isResizing={false}
                sources={sources}
                userId={user?.id}
                noteId={urlNotebookId}
              />
            </div>
          )}
        </div>
      </main>
    </AudioPlayerProvider>
  );
}
