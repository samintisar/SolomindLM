import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useQuery } from "convex/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { NotebookItem } from "@/shared/types/index";
import { isNativeShell } from "@/utils/platformDetection";
import { AuthProvider } from "./features/auth/AuthContext";
import { AuthPage } from "./features/auth/AuthPage";
import { useAuthGuard } from "./features/auth/hooks/useAuthGuard";
import { useStripeRedirect } from "./features/auth/hooks/useStripeRedirect";
import { useAuth } from "./features/auth/useAuth";
import { BillingPage } from "./features/billing/components/BillingPage";
import { useSubscriptionStatus } from "./features/billing/services/subscriptionApi";
import { ChatStreamingProvider } from "./features/chat/ChatStreamingContext";
import { useChatStream } from "./features/chat/hooks/useChatStream";
import { useConversationCRUD } from "./features/chat/hooks/useConversationCRUD";
import { LandingPage } from "./features/landing/LandingPage";
import { PrivacyPolicy } from "./features/legal/components/PrivacyPolicy";
import { TermsOfService } from "./features/legal/components/TermsOfService";
import { HomePage } from "./features/notebooks/components/HomePage";
import { ShareNotebookModal } from "./features/notebooks/components/modals/ShareNotebookModal";
import { FolderView } from "./features/notebooks/components/views/FolderView";
import { ForkNotebookPage } from "./features/notebooks/components/views/ForkNotebookPage";
import { NotebookView } from "./features/notebooks/components/views/NotebookView";
import { useFolderCRUD } from "./features/notebooks/hooks/useFolderCRUD";
import { useNotebookCRUD } from "./features/notebooks/hooks/useNotebookCRUD";
import { NotebookProvider } from "./features/notebooks/NotebookContext";
import { useFolders } from "./features/notebooks/services/foldersApi";
import { useNotebooks } from "./features/notebooks/services/notebooksApi";
import { ChecklistCard } from "./features/onboarding/components/ChecklistCard";
import { TourTooltip } from "./features/onboarding/components/TourTooltip";
import { OnboardingProvider } from "./features/onboarding/OnboardingProvider";
import { useSourceManager } from "./features/sources/hooks/useSourceManager";
import { SourcesProvider } from "./features/sources/SourcesContext";
import { useCreateDocument, useGenerateUploadUrl } from "./features/sources/services/documentsApi";
import { LiteratureReportPage } from "./features/studio/components/LiteratureReportPage";
import { LiteratureTablePage } from "./features/studio/components/LiteratureTablePage";
import { useNoteCRUD } from "./features/studio/hooks/useNoteCRUD";
import { StudioProvider } from "./features/studio/StudioContext";
import { ProtectedRoute } from "./shared/components/ProtectedRoute";
import { ToastContainer } from "./shared/components/ToastContainer";
import { ThemeProvider } from "./shared/contexts/ThemeContext";
import { ToastProvider } from "./shared/contexts/ToastContext";
import { Header } from "./shared/ui/Header";
import "mind-elixir/style.css";

const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [notebookTitle, setNotebookTitle] = useState("Notebook");
  const [shareModalOpen, setShareModalOpen] = useState(false);

  useStripeRedirect({ isAuthenticated, user });
  useAuthGuard({ isAuthenticated, isLoading });

  useEffect(() => {
    if (!isNativeShell() || location.pathname !== "/") return;
    if (isLoading) return;
    navigate(isAuthenticated ? "/home" : "/sign-in", { replace: true });
  }, [location.pathname, isAuthenticated, isLoading, navigate]);

  const onRequireAuth = useCallback(
    (errorMessage: string) => {
      const returnTo =
        location.pathname === "/" ? "/home" : `${location.pathname}${location.search}`;
      navigate("/sign-in", {
        state: { from: returnTo, message: errorMessage },
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
      api.documents.index.list,
      dataNotebookId ? { notebookId: dataNotebookId as Id<"notebooks"> } : "skip"
    ) ?? [];
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
    if (location.pathname === "/") return "landing";
    if (location.pathname === "/home") return "home";
    if (location.pathname === "/billing") return "billing";
    if (location.pathname.startsWith("/folder/")) return "folder";
    if (location.pathname.startsWith("/notebook/")) return "notebook";
    return "landing";
  }, [location.pathname]);

  const urlFolderId = useMemo(() => {
    if (location.pathname.startsWith("/folder/")) {
      return location.pathname.split("/folder/")[1] || null;
    }
    return null;
  }, [location.pathname]);

  const isPublicPage =
    location.pathname === "/" ||
    location.pathname === "/privacy" ||
    location.pathname === "/terms" ||
    location.pathname === "/sign-in";
  const isHomePage =
    location.pathname === "/home" ||
    location.pathname === "/billing" ||
    location.pathname.startsWith("/folder/");

  const notebookList = useMemo(() => notebooks ?? [], [notebooks]);
  const folderList = useMemo(() => folders ?? [], [folders]);
  const featuredNotebooks = useMemo(
    () => notebookList.filter((nb: NotebookItem) => nb.isFeatured),
    [notebookList]
  );
  const recentNotebooks = useMemo(
    () => notebookList.filter((nb: NotebookItem) => !nb.isFeatured),
    [notebookList]
  );
  const activeNotebook = useMemo(() => {
    if (!urlNotebookId || notebookList.length === 0) return undefined;
    return notebookList.find((nb: NotebookItem) => nb.id === urlNotebookId);
  }, [urlNotebookId, notebookList]);

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

  useEffect(() => {
    if (urlNotebookId && notebookList.length > 0) {
      const notebook = notebookList.find((nb: NotebookItem) => nb.id === urlNotebookId);
      if (notebook) {
        setNotebookTitle(notebook.title);
      }
    }
  }, [urlNotebookId, notebookList]);

  useEffect(() => {
    if (!shareModalOpen) return;
    if (!urlNotebookId || !activeNotebook || activeNotebook.isSharedNotebook) {
      setShareModalOpen(false);
    }
  }, [shareModalOpen, urlNotebookId, activeNotebook]);

  const handleLogoClick = useCallback(() => {
    navigate(isNativeShell() ? "/home" : "/");
    setActiveNotebookId(null);
  }, [navigate]);

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
      featuredNotebooks,
      recentNotebooks,
      activeNotebook,
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
      featuredNotebooks,
      recentNotebooks,
      activeNotebook,
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

  const chatStreamingContextValue = useMemo(
    () => ({
      messages: chatStream.chatDisplayMessages,
      isChatStreaming: chatStream.isChatStreaming,
      remoteChatGenerating: chatStream.remoteChatGenerating,
      remoteGenerationBlocksSend: chatStream.remoteGenerationBlocksSend,
      onSendMessage: chatStream.handleSendMessage,
      onStopChat: chatStream.stopChat,
      consumeResearchExecuteStream: chatStream.consumeResearchExecuteStream,
      onClearHistory: chatStream.handleClearChatHistory,
      onSetFeedback: chatStream.setMessageFeedback,
      onRetry: chatStream.handleRetryMessage,
      onSaveChatOptimistic: chatStream.setOptimisticSaveNote,
      externalSources: chatStream.externalSources,
      clearExternalSources: chatStream.clearExternalSources,
      sourceCount: chatStream.sourceCount,
      sourceSummary: chatStream.sourceSummary,
      suggestions: chatStream.suggestions,
      isLoadingSuggestions: chatStream.isLoadingSuggestions,
      activeConversationId,
      conversations: conversationCRUD.conversations,
      onSelectConversation: setActiveConversationId,
      onCreateConversation: conversationCRUD.handleCreate,
      onRenameConversation: conversationCRUD.handleRename,
      onDeleteConversation: async (id: string) => {
        const list = conversationCRUD.conversations;
        const wasOnlyThread = list != null && list.length === 1 && list[0]._id === id;
        await conversationCRUD.handleDelete(id);
        if (wasOnlyThread) {
          const newId = await conversationCRUD.handleCreate();
          setActiveConversationId(newId ?? null);
          return;
        }
        if (activeConversationId === id) {
          setActiveConversationId(null);
        }
      },
    }),
    [chatStream, activeConversationId, conversationCRUD]
  );

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

  const studioContextValue = useMemo(
    () => ({
      notes: chatStream.displayNotes,
      onUpdateNote: noteCRUD.handleUpdateNote,
      onUpdateNoteFull: noteCRUD.handleUpdateNoteFull,
      onDeleteNote: noteCRUD.handleDeleteNote,
      onAddNote: noteCRUD.handleAddNote,
      onSaveReportContent: noteCRUD.handleSaveReportContent,
    }),
    [chatStream.displayNotes, noteCRUD]
  );

  return (
    <OnboardingProvider key={user?.id ?? "anon"} isAuthenticated={isAuthenticated}>
      {shareModalOpen && urlNotebookId && activeNotebook && !activeNotebook.isSharedNotebook && (
        <ShareNotebookModal notebookId={urlNotebookId} onClose={() => setShareModalOpen(false)} />
      )}

      <div
        className={`w-full bg-background text-foreground font-serif ${isPublicPage ? "" : "flex flex-col h-screen overflow-hidden"}`}
      >
        {!isPublicPage && !isNativeShell() && (
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
            notebookRenamable={
              location.pathname.startsWith("/notebook/") &&
              activeNotebook !== undefined &&
              !activeNotebook?.isSharedNotebook
            }
            onShare={
              location.pathname.startsWith("/notebook/") &&
              urlNotebookId &&
              activeNotebook &&
              !activeNotebook.isSharedNotebook
                ? () => setShareModalOpen(true)
                : undefined
            }
          />
        )}

        <NotebookProvider value={notebookContextValue}>
          <Routes>
            <Route path="/" element={<LandingPage onGetStarted={() => navigate("/home")} />} />
            <Route path="/sign-in" element={<AuthPage />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />

            <Route path="/home" element={<HomePage />} />

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
                  <ChatStreamingProvider value={chatStreamingContextValue}>
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
        </NotebookProvider>
      </div>

      {!isNativeShell() && <TourTooltip />}
      <ChecklistCard />
    </OnboardingProvider>
  );
};

const App: React.FC = () => {
  return (
    <>
      <Analytics />
      <SpeedInsights />
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <AppContent />
              <ToastContainer />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </>
  );
};

export default App;
