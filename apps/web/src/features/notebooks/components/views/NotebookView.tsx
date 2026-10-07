import type { Id } from "@convex/_generated/dataModel";
import {
  type ComponentProps,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Group, Panel, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { useLocation, useNavigate } from "react-router-dom";
import { AudioPlayerProvider } from "@/features/audio/AudioPlayerContext";
import { useAuth } from "@/features/auth/useAuth";
import { ChatPanel } from "@/features/chat/components/ChatPanel";
import { useChatStreamingContext } from "@/features/chat/useChatStreaming";
import { useNotebookContext } from "@/features/notebooks/useNotebookContext";
import { resolveAskSources } from "@/features/notebooks/utils/askSources";
import {
  SourcesPanel,
  type SourcesPanelFocusRequest,
} from "@/features/sources/components/SourcesPanel";
import { useSourcesContext } from "@/features/sources/useSourcesContext";
import type { ActiveLiteratureView } from "@/features/studio/types/literatureStudio";
import { useStudioContext } from "@/features/studio/useStudioContext";
import { useToast } from "@/shared/contexts/useToast";
import { cn } from "@/shared/utils/cn";
import { NotebookPanelSeparator } from "./NotebookPanelSeparator";
import { NotebookRightPanel } from "./NotebookRightPanel";

type MobileTab = "sources" | "chat" | "studio";

const MOBILE_TABS: Array<{ id: MobileTab; label: string; onboarding?: string }> = [
  { id: "sources", label: "Sources" },
  { id: "chat", label: "Chat" },
  { id: "studio", label: "Studio", onboarding: "studio-panel-toggle" },
];

const noop = () => undefined;

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

  const sourcesPanelRef = usePanelRef();

  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTab>("sources");

  const [isSourcesOpen, setIsSourcesOpen] = useState(true);

  const [isStudioOpen, setIsStudioOpen] = useState(true);

  const desktopPanelIds =
    isStudioOpen && urlNotebookId
      ? ["notebook-sources", "notebook-chat", "notebook-studio"]
      : ["notebook-sources", "notebook-chat"];
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "notebook-desktop-panels",
    panelIds: desktopPanelIds,
  });

  const [sourceFocusRequest, setSourceFocusRequest] = useState<SourcesPanelFocusRequest | null>(
    null
  );

  const [activeLiteratureView, setActiveLiteratureView] = useState<ActiveLiteratureView | null>(
    null
  );
  /** Show a literature view (or Studio, for `null`) in the right panel and bring it into view. */
  const openStudio = useCallback((view: ActiveLiteratureView | null) => {
    setActiveLiteratureView(view);
    setIsStudioOpen(true);
    setMobileActiveTab("studio");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tableId = params.get("literatureTable");
    const reportId = params.get("literatureReport");
    if (!tableId && !reportId) return;

    openStudio(
      tableId
        ? { kind: "table", tableId: tableId as Id<"literatureTables"> }
        : { kind: "report", reportId: reportId as Id<"literatureReports"> }
    );
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate, openStudio]);

  const handleOpenLiteratureTable = useCallback(
    (tableId: Id<"literatureTables">) => openStudio({ kind: "table", tableId }),
    [openStudio]
  );

  const handleOpenLiteratureReport = useCallback(
    (reportId: Id<"literatureReports">) => openStudio({ kind: "report", reportId }),
    [openStudio]
  );

  const handleOpenRankedPapers = useCallback(
    (sessionId: Id<"literatureReviewSessions">) => openStudio({ kind: "papers", sessionId }),
    [openStudio]
  );

  const handleOpenScreeningDecisions = useCallback(
    (sessionId: Id<"literatureReviewSessions">) => openStudio({ kind: "screening", sessionId }),
    [openStudio]
  );

  const handleCloseLiteratureView = useCallback(() => {
    setActiveLiteratureView(null);
  }, []);

  /** Saved reports and spreadsheets open as notes in Studio (StudioPanel listens for setActiveNote). */
  const openSavedNote = useCallback(
    (noteId: Id<"reports"> | Id<"spreadsheets">) => {
      window.dispatchEvent(new CustomEvent("setActiveNote", { detail: { noteId } }));
      openStudio(null);
    },
    [openStudio]
  );

  const toggleSources = () => {
    if (isSourcesOpen) {
      sourcesPanelRef.current?.collapse();
      setIsSourcesOpen(false);
    } else {
      sourcesPanelRef.current?.expand();
      setIsSourcesOpen(true);
    }
  };

  const toggleStudio = useCallback(() => setIsStudioOpen((isOpen) => !isOpen), []);

  const handleAskInChat = useCallback(
    (prompt: string, documentIds?: string[]) => {
      if (!urlNotebookId || isChatStreaming || remoteGenerationBlocksSend) return;

      const choice = resolveAskSources(sources, documentIds);

      if (choice.kind === "none") {
        toastError("Please select at least one source before asking a question");

        return;
      }

      setMobileActiveTab("chat");

      onSendMessage(
        prompt,
        undefined,
        { channels: ["notebook"] },
        choice.kind === "override" ? { documentIdsOverride: choice.documentIds } : undefined
      );
    },
    [isChatStreaming, onSendMessage, remoteGenerationBlocksSend, sources, toastError, urlNotebookId]
  );

  // Mini Audio Player state

  const [miniPlayerVisible, setMiniPlayerVisible] = useState(false);

  const [miniPlayerData, setMiniPlayerData] = useState<{
    audioUrl: string;
    title: string;
    transcript?: string;
    audioOverviewId?: string;
  } | null>(null);
  /** Studio note behind the mini player, so "expand" can reopen it. */
  const playingAudioNoteIdRef = useRef<string | null>(null);

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
        playingAudioNoteIdRef.current = noteId;
      }
    },

    []
  );

  const handleCloseMiniPlayer = useCallback(() => {
    setMiniPlayerVisible(false);
  }, []);

  const handleExpandAudioPlayer = useCallback(() => {
    setMiniPlayerVisible(false);

    const noteId = playingAudioNoteIdRef.current;
    if (noteId && notes.some((n) => n.id === noteId)) {
      window.dispatchEvent(new CustomEvent("setActiveNote", { detail: { noteId } }));
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

  const renderRightPanel = (onCloseStudio: () => void) =>
    urlNotebookId ? (
      <NotebookRightPanel
        notebookId={urlNotebookId}
        sources={sources}
        activeLiteratureView={activeLiteratureView}
        onCloseLiteratureView={handleCloseLiteratureView}
        onOpenSavedReport={openSavedNote}
        onOpenSavedSpreadsheet={openSavedNote}
        onCloseStudio={onCloseStudio}
        onAskInChat={handleAskInChat}
      />
    ) : null;

  const chatPanelProps = {
    notebookId: urlNotebookId as Id<"notebooks"> | null,
    notebookTitle,
    notebookIcon: activeNotebook?.icon,
    notebookCoverColor: activeNotebook?.coverColor,
    chatSettings: activeNotebook?.chatSettings,
    onOpenNotebookSource: handleOpenNotebookSourceFromChat,
    onOpenLiteratureTable: handleOpenLiteratureTable,
    onOpenLiteratureReport: handleOpenLiteratureReport,
    onOpenRankedPapers: handleOpenRankedPapers,
    onOpenScreeningDecisions: handleOpenScreeningDecisions,
  } satisfies Partial<ComponentProps<typeof ChatPanel>>;

  const sourcesPanelProps = {
    userId: user?.id,
    noteId: urlNotebookId,
    onDocumentUploaded: noop,
    focusSourceRequest: sourceFocusRequest,
    onFocusSourceHandled: clearSourceFocusRequest,
    onDiscussTopic: handleDiscussSourceTopic,
  } satisfies Partial<ComponentProps<typeof SourcesPanel>>;

  return (
    <AudioPlayerProvider value={audioPlayerContextValue}>
      <main className="flex-1 flex flex-col overflow-hidden relative animate-in fade-in duration-300">
        {/* Mobile panel tabs (below app header on all viewports) */}
        <div className="md:hidden sticky top-0 z-60 flex h-12 items-center justify-around gap-1 border-b border-border bg-background px-2">
          {MOBILE_TABS.map((tab, index) => (
            <Fragment key={tab.id}>
              {index > 0 && <div className="w-px h-6 bg-border"></div>}
              <button
                data-onboarding={tab.onboarding}
                onClick={() => setMobileActiveTab(tab.id)}
                className={cn(
                  "flex-1 rounded-lg py-2 px-4 text-sm font-semibold transition-colors",
                  mobileActiveTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            </Fragment>
          ))}
        </div>

        {/* Desktop Layout */}

        <div className="hidden md:flex min-h-0 min-w-0 w-full flex-1 overflow-hidden">
          <Group
            id="notebook-desktop-panels"
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            className="h-full min-h-0 min-w-0 w-full"
          >
            <Panel
              id="notebook-sources"
              panelRef={sourcesPanelRef}
              collapsible={true}
              collapsedSize={0}
              defaultSize="360px"
              minSize="220px"
              maxSize="70%"
              className="min-h-0 min-w-0"
              onResize={() => {
                const collapsed = sourcesPanelRef.current?.isCollapsed() ?? false;
                setIsSourcesOpen(!collapsed);
              }}
            >
              <SourcesPanel isOpen={isSourcesOpen} onClose={toggleSources} {...sourcesPanelProps} />
            </Panel>

            <NotebookPanelSeparator
              disabled={!isSourcesOpen}
              data-testid="notebook-sources-separator"
            />

            <Panel id="notebook-chat" minSize="280px" className="min-h-0 min-w-0">
              <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                <ChatPanel
                  isLeftOpen={isSourcesOpen}
                  isRightOpen={isStudioOpen}
                  toggleLeft={toggleSources}
                  toggleRight={toggleStudio}
                  {...chatPanelProps}
                />
              </div>
            </Panel>

            {isStudioOpen && urlNotebookId ? (
              <>
                <NotebookPanelSeparator data-testid="notebook-studio-separator" />
                <Panel
                  id="notebook-studio"
                  defaultSize="420px"
                  minSize="220px"
                  maxSize="70%"
                  className="min-h-0 min-w-0"
                >
                  {renderRightPanel(toggleStudio)}
                </Panel>
              </>
            ) : null}
          </Group>
        </div>

        {/* Mobile Layout */}

        <div className="md:hidden flex flex-1 w-full flex-col overflow-hidden">
          {mobileActiveTab === "sources" && (
            <div className="flex-1 w-full overflow-hidden">
              <SourcesPanel isOpen={true} onClose={noop} {...sourcesPanelProps} />
            </div>
          )}

          {mobileActiveTab === "chat" && (
            <div className="flex-1 w-full overflow-hidden">
              <ChatPanel
                isLeftOpen={false}
                isRightOpen={false}
                toggleLeft={noop}
                toggleRight={noop}
                {...chatPanelProps}
              />
            </div>
          )}

          {mobileActiveTab === "studio" && (
            <div className="flex-1 w-full overflow-hidden">{renderRightPanel(noop)}</div>
          )}
        </div>
      </main>
    </AudioPlayerProvider>
  );
}
