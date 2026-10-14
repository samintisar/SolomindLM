import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import type { DocumentSummary } from "@convex/documents/listSummary";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { BillingPage } from "@/features/billing/components/BillingPage";
import { useSubscriptionStatus } from "@/features/billing/services/subscriptionApi";
import { ChatStreamingProvider } from "@/features/chat/ChatStreamingContext";
import { useChatSessionValue } from "@/features/chat/hooks/useChatSessionValue";
import { useChatStream } from "@/features/chat/hooks/useChatStream";
import { useConversationCRUD } from "@/features/chat/hooks/useConversationCRUD";
import { AdminFeedbackPage } from "@/features/feedback/components/AdminFeedbackPage";
import { HomePage } from "@/features/notebooks/components/HomePage";
import { ShareNotebookModal } from "@/features/notebooks/components/modals/ShareNotebookModal";
import { FolderView } from "@/features/notebooks/components/views/FolderView";
import { ForkNotebookPage } from "@/features/notebooks/components/views/ForkNotebookPage";
import { NotebookView } from "@/features/notebooks/components/views/NotebookView";
import { useFolderCRUD } from "@/features/notebooks/hooks/useFolderCRUD";
import { useNotebookCRUD } from "@/features/notebooks/hooks/useNotebookCRUD";
import { NotebookProvider } from "@/features/notebooks/NotebookContext";
import { useFolders } from "@/features/notebooks/services/foldersApi";
import { useForkPublicNotebook, useNotebooks } from "@/features/notebooks/services/notebooksApi";
import { ChecklistCard } from "@/features/onboarding/components/ChecklistCard";
import { TourTooltip } from "@/features/onboarding/components/TourTooltip";
import { OnboardingProvider } from "@/features/onboarding/OnboardingProvider";
import { useSourceManager } from "@/features/sources/hooks/useSourceManager";
import { SourcesProvider } from "@/features/sources/SourcesContext";
import { useCreateDocument, useGenerateUploadUrl } from "@/features/sources/services/documentsApi";
import { LiteratureReportPage } from "@/features/studio/components/LiteratureReportPage";
import { LiteratureTablePage } from "@/features/studio/components/LiteratureTablePage";
import { useNoteCRUD } from "@/features/studio/hooks/useNoteCRUD";
import { StudioProvider } from "@/features/studio/StudioContext";
import { ProtectedRoute } from "@/shared/components/ProtectedRoute";
import { RouteTransition } from "@/shared/components/RouteTransition";
import { useLimitErrorToast } from "@/shared/hooks/useLimitErrorToast";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import { NotebookItem } from "@/shared/types/index";
import { Header } from "@/shared/ui/Header";
import { isNativeShell } from "@/utils/platformDetection";

/** Stable fallback while the documents query is skipped or loading, so consumers' effects don't re-run each render. */
const EMPTY_DOCUMENTS: readonly DocumentSummary[] = Object.freeze([]);

/**
 * The authenticated app: notebooks, folders, studio, billing. Owns the app-wide data hooks and
 * providers, so it only mounts (and its chunk only loads) on non-public routes.
 */
export default function AppShell({ animateOnMount }: { animateOnMount: boolean }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [notebookTitle, setNotebookTitle] = useState("Notebook");
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const onRequireAuth = useCallback(
    (errorMessage: string) => {
      navigate("/sign-in", {
        state: { from: `${location.pathname}${location.search}`, message: errorMessage },
      } as never);
    },
    [navigate, location.pathname, location.search]
  );

  /** Path-derived id is available on first paint; `activeNotebookId` state syncs in an effect and can lag behind the route. */
  const urlNotebookId = useMemo(() => {
    const match = location.pathname.match(/^\/notebook\/([^/]+)/);
    return match?.[1] ?? null;
  }, [location.pathname]);

  const dataNotebookId = useMemo(() => {
    if (urlNotebookId && urlNotebookId !== "new") return urlNotebookId;
    if (activeNotebookId && activeNotebookId !== "new") return activeNotebookId;
    return null;
  }, [urlNotebookId, activeNotebookId]);

  const notebooks = useNotebooks();
  const folders = useFolders();
  const documents =
    useQuery(
      api.documents.listSummary.listSummary,
      dataNotebookId ? { notebookId: dataNotebookId as Id<"notebooks"> } : "skip"
    ) ?? EMPTY_DOCUMENTS;
  useGenerateUploadUrl();
  useCreateDocument();

  const sourceManager = useSourceManager({
    documents,
    notebookId: dataNotebookId,
  });
  const noteCRUD = useNoteCRUD({ activeNotebookId: dataNotebookId });
  const conversationCRUD = useConversationCRUD(dataNotebookId);
  const chatStream = useChatStream({
    activeNotebookId: dataNotebookId,
    activeConversationId,
    sources: sourceManager.sources,
    notes: noteCRUD.notes,
    documents,
    onConversationEnsured: setActiveConversationId,
  });
  const notebookCRUD = useNotebookCRUD({
    isAuthenticated,
    user,
    activeNotebookId,
    setNotebookTitle,
    onRequireAuth,
  });
  const folderCRUD = useFolderCRUD({ isAuthenticated, user, onRequireAuth });

  const subscriptionStatus = useSubscriptionStatus();

  // Auto-select the most recently updated conversation when the list loads
  useEffect(() => {
    if (
      !activeConversationId &&
      conversationCRUD.conversations &&
      conversationCRUD.conversations.length > 0
    ) {
      setActiveConversationId(conversationCRUD.conversations[0]._id);
    }
  }, [activeConversationId, conversationCRUD.conversations]);

  const currentView = useMemo(() => {
    if (location.pathname === "/home") return "home";
    if (location.pathname === "/billing") return "billing";
    if (location.pathname.startsWith("/folder/")) return "folder";
    if (location.pathname.startsWith("/notebook/")) return "notebook";
    return "other";
  }, [location.pathname]);

  const urlFolderId = useMemo(() => {
    if (location.pathname.startsWith("/folder/")) {
      return location.pathname.split("/folder/")[1] || null;
    }
    return null;
  }, [location.pathname]);

  const isNotebookRoute = location.pathname.startsWith("/notebook/");
  const isHomePage =
    location.pathname === "/home" ||
    location.pathname === "/billing" ||
    location.pathname.startsWith("/folder/");

  const notebookList = useMemo(() => notebooks ?? [], [notebooks]);
  const folderList = useMemo(() => folders ?? [], [folders]);
  const recentNotebooks = notebookList;
  const listedNotebook = useMemo(
    () =>
      urlNotebookId ? notebookList.find((nb: NotebookItem) => nb.id === urlNotebookId) : undefined,
    [urlNotebookId, notebookList]
  );
  // A public notebook you don't own or cowork on isn't in your list; fetch it directly.
  const visitedNotebook = useQuery(
    api.notebooks.index.get,
    urlNotebookId && urlNotebookId !== "new" && notebooks !== undefined && !listedNotebook
      ? { id: urlNotebookId as Id<"notebooks"> }
      : "skip"
  );
  const activeNotebook: NotebookItem | undefined = listedNotebook ?? visitedNotebook ?? undefined;
  const isViewingPublic = activeNotebook?.access === "viewer";

  useEffect(() => {
    if (urlNotebookId && urlNotebookId !== activeNotebookId) {
      setActiveNotebookId(urlNotebookId);
      setActiveConversationId(null);
    }
    if (!urlNotebookId && currentView !== "notebook") {
      setActiveNotebookId(null);
      setActiveConversationId(null);
    }
  }, [urlNotebookId, currentView, activeNotebookId]);

  const activeNotebookTitle = activeNotebook?.title;
  useEffect(() => {
    if (urlNotebookId && activeNotebookTitle !== undefined) setNotebookTitle(activeNotebookTitle);
  }, [urlNotebookId, activeNotebookTitle]);

  useEffect(() => {
    if (!shareModalOpen) return;
    if (!urlNotebookId || !activeNotebook || activeNotebook.access !== "owner") {
      setShareModalOpen(false);
    }
  }, [shareModalOpen, urlNotebookId, activeNotebook]);

  const forkPublic = useForkPublicNotebook();
  const { handleLimitError } = useLimitErrorToast();
  const { showError: showServiceError } = useServiceErrorToast();
  const handleFork = useCallback(async () => {
    if (!urlNotebookId) return;
    try {
      const { newNotebookId } = await forkPublic({ notebookId: urlNotebookId as Id<"notebooks"> });
      navigate(`/notebook/${newNotebookId}`);
    } catch (error) {
      const handled = await handleLimitError(error);
      if (!handled.isLimitError) showServiceError(error);
    }
  }, [forkPublic, navigate, handleLimitError, showServiceError, urlNotebookId]);

  // Signed in, / only bounces back to /home (useAuthGuard), and crossing to the public shell would
  // unmount this whole shell on the way. Signed-out visitors still get the landing page.
  const handleLogoClick = useCallback(() => {
    navigate(isNativeShell() || isAuthenticated ? "/home" : "/");
    setActiveNotebookId(null);
  }, [navigate, isAuthenticated]);

  const handleSelectNotebook = useCallback(
    (notebook: NotebookItem) => {
      navigate(`/notebook/${notebook.id}`);
    },
    [navigate]
  );

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      navigate(`/folder/${folderId}`);
    },
    [navigate]
  );

  const notebookContextValue = useMemo(
    () => ({
      notebookList,
      recentNotebooks,
      activeNotebook,
      notebooksLoading: notebooks === undefined || folders === undefined,
      urlNotebookId,
      urlFolderId,
      currentView,
      folders: folderList,
      selectNotebook: handleSelectNotebook,
      createNotebook: notebookCRUD.handleCreateNotebook,
      updateNotebook: notebookCRUD.handleUpdateNotebook,
      deleteNotebook: notebookCRUD.handleDeleteNotebook,
      selectFolder: handleSelectFolder,
      folderBack: () => navigate("/home"),
      createFolder: folderCRUD.handleCreateFolder,
      updateFolder: folderCRUD.handleUpdateFolder,
      deleteFolder: folderCRUD.handleDeleteFolder,
      moveNotebookToFolder: folderCRUD.handleMoveNotebookToFolder,
      logoClick: handleLogoClick,
      getStarted: () => navigate("/home"),
      billingClick: () => navigate("/billing"),
      billingBack: () => navigate("/home"),
      notebookTitle,
      setNotebookTitle,
      subscriptionStatus,
      isAuthenticated,
      onRequireAuth,
    }),
    [
      notebookList,
      recentNotebooks,
      activeNotebook,
      notebooks,
      folders,
      urlNotebookId,
      urlFolderId,
      currentView,
      folderList,
      handleSelectNotebook,
      handleSelectFolder,
      notebookCRUD,
      folderCRUD,
      handleLogoClick,
      notebookTitle,
      subscriptionStatus,
      navigate,
      isAuthenticated,
      onRequireAuth,
    ]
  );

  // Two halves: the session value keeps its identity while a reply streams; only `messages`
  // changes per frame, so only the chat message list re-renders (#418).
  const chatSessionValue = useChatSessionValue({
    chatStream,
    conversationCRUD,
    activeConversationId,
    setActiveConversationId,
  });

  const sourcesContextValue = useMemo(
    () => ({
      sources: sourceManager.sources,
      onToggleSource: sourceManager.handleToggleSource,
      onToggleAll: sourceManager.handleToggleAll,
      onAddSource: sourceManager.handleAddSource,
      onDeleteSource: sourceManager.handleDeleteSource,
      onDeleteSelectedSources: sourceManager.handleDeleteSelectedSources,
      onRenameSource: sourceManager.handleRenameSource,
    }),
    [sourceManager]
  );

  // Built from individual fields: `chatStream` and `noteCRUD` are new objects every render.
  const { displayNotes, addPendingStudioNote, updatePendingStudioNote, removePendingStudioNote } =
    chatStream;
  const { handleUpdateNote, handleDeleteNote, handleSaveReportContent } = noteCRUD;
  const handleDeleteStudioNote = useCallback(
    async (id: string) => {
      removePendingStudioNote(id);
      await handleDeleteNote(id);
    },
    [removePendingStudioNote, handleDeleteNote]
  );
  const studioContextValue = useMemo(
    () => ({
      notes: displayNotes,
      onUpdateNote: handleUpdateNote,
      onUpdateNoteFull: updatePendingStudioNote,
      onDeleteNote: handleDeleteStudioNote,
      onAddNote: addPendingStudioNote,
      onSaveReportContent: handleSaveReportContent,
    }),
    [
      displayNotes,
      handleUpdateNote,
      updatePendingStudioNote,
      handleDeleteStudioNote,
      addPendingStudioNote,
      handleSaveReportContent,
    ]
  );

  return (
    <OnboardingProvider key={user?.id ?? "anon"} isAuthenticated={isAuthenticated}>
      {shareModalOpen && urlNotebookId && activeNotebook?.access === "owner" && (
        <ShareNotebookModal
          notebookId={urlNotebookId}
          isPublic={activeNotebook.isPublic ?? false}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      <div className="w-full bg-background text-foreground font-serif flex flex-col h-screen overflow-hidden">
        <Header
          title={notebookTitle}
          onRename={(newTitle: string) => {
            setNotebookTitle(newTitle);
            if (activeNotebookId && activeNotebookId !== "new" && isAuthenticated) {
              notebookCRUD.handleUpdateNotebook(activeNotebookId, { title: newTitle });
            }
          }}
          isHome={isHomePage}
          onLogoClick={handleLogoClick}
          onBillingClick={() => navigate("/billing")}
          hasSubscription={subscriptionStatus.hasSubscription}
          // Editors (cowork link) and viewers (public notebook) can't rename or share.
          notebookRenamable={isNotebookRoute && activeNotebook?.access === "owner"}
          onShare={
            isNotebookRoute && activeNotebook?.access === "owner"
              ? () => setShareModalOpen(true)
              : undefined
          }
          byline={
            isNotebookRoute && isViewingPublic
              ? `Public · by ${activeNotebook?.ownerName ?? "SolomindLM user"}`
              : undefined
          }
          onFork={isNotebookRoute && isViewingPublic ? () => void handleFork() : undefined}
        />

        <NotebookProvider value={notebookContextValue}>
          <RouteTransition fill animateOnMount={animateOnMount}>
            <Routes>
              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <HomePage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/folder/:folderId"
                element={
                  <ProtectedRoute>
                    <main className="flex-1 overflow-auto">
                      <FolderView folderId={urlFolderId || ""} viewMode="grid" />
                    </main>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/billing"
                element={
                  <ProtectedRoute>
                    <main className="flex-1 overflow-auto">
                      <BillingPage onBack={() => navigate("/home")} />
                    </main>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/feedback"
                element={
                  <ProtectedRoute>
                    <AdminFeedbackPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/share/fork/:token"
                element={
                  <ProtectedRoute>
                    <main className="flex-1 overflow-auto">
                      <ForkNotebookPage />
                    </main>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/notebook/:id"
                element={
                  <ProtectedRoute requireNotebookAccess={true}>
                    <ChatStreamingProvider
                      session={chatSessionValue}
                      messages={chatStream.chatDisplayMessages}
                    >
                      <SourcesProvider value={sourcesContextValue}>
                        <StudioProvider value={studioContextValue}>
                          <NotebookView />
                        </StudioProvider>
                      </SourcesProvider>
                    </ChatStreamingProvider>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/notebook/:id/table/:tableId"
                element={
                  <ProtectedRoute requireNotebookAccess={true}>
                    <LiteratureTablePage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/notebook/:id/report/:reportId"
                element={
                  <ProtectedRoute requireNotebookAccess={true}>
                    <LiteratureReportPage />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </RouteTransition>
        </NotebookProvider>
      </div>

      {!isNativeShell() && <TourTooltip />}
      <ChecklistCard />
    </OnboardingProvider>
  );
}
