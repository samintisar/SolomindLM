import React, { useState, useEffect, useMemo, useCallback } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Header } from "./shared/ui/Header";
import { HomePage } from "./features/notebooks/components/HomePage";
import { FolderView } from "./features/notebooks/components/views/FolderView";
import { NotebookProvider } from "./features/notebooks/NotebookContext";
import { ChatStreamingProvider } from "./features/chat/ChatStreamingContext";
import { SourcesProvider } from "./features/sources/SourcesContext";
import { StudioProvider } from "./features/studio/StudioContext";
import { NotebookView } from "./features/notebooks/components/views/NotebookView";
import { ForkNotebookPage } from "./features/notebooks/components/views/ForkNotebookPage";
import { ShareNotebookModal } from "./features/notebooks/components/modals/ShareNotebookModal";
import { BillingPage } from "./features/billing/components/BillingPage";
import { LandingPage } from "./features/landing/LandingPage";
import { useAuth, AuthProvider } from "./features/auth/AuthContext";
import { AuthPage } from "./features/auth/AuthPage";
import { ThemeProvider } from "./shared/contexts/ThemeContext";
import { ToastProvider } from "./shared/contexts/ToastContext";
import { ToastContainer } from "./shared/components/ToastContainer";
import { ProtectedRoute } from "./shared/components/ProtectedRoute";
import { PrivacyPolicy } from "./features/legal/components/PrivacyPolicy";
import { TermsOfService } from "./features/legal/components/TermsOfService";
import { NotebookItem } from "@/shared/types/index";
import { useNotebooks } from "./features/notebooks/services/notebooksApi";
import { useFolders } from "./features/notebooks/services/foldersApi";
import { useGenerateUploadUrl, useCreateDocument } from "./features/sources/services/documentsApi";
import { useSubscriptionStatus } from "./features/billing/services/subscriptionApi";
import { useStripeRedirect } from "./features/auth/hooks/useStripeRedirect";
import { useAuthGuard } from "./features/auth/hooks/useAuthGuard";
import { isNativeShell } from "@/utils/platformDetection";
import { useSourceManager } from "./features/sources/hooks/useSourceManager";
import { useNoteCRUD } from "./features/studio/hooks/useNoteCRUD";
import { useNotebookCRUD } from "./features/notebooks/hooks/useNotebookCRUD";
import { useFolderCRUD } from "./features/notebooks/hooks/useFolderCRUD";
import { useChatStream } from "./features/chat/hooks/useChatStream";
import { useConversationCRUD } from "./features/chat/hooks/useConversationCRUD";
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

  const notebooks = useNotebooks();
  const folders = useFolders();
  const documents =
    useQuery(
      api.documents.index.list,
      activeNotebookId && activeNotebookId !== "new"
        ? { notebookId: activeNotebookId as Id<"notebooks"> }
        : "skip"
    ) ?? [];
  useGenerateUploadUrl();
  useCreateDocument();

  const sourceManager = useSourceManager({
    documents,
    notebookId: activeNotebookId && activeNotebookId !== "new" ? activeNotebookId : null,
  });
  const noteCRUD = useNoteCRUD({ activeNotebookId });
  const conversationCRUD = useConversationCRUD(
    activeNotebookId && activeNotebookId !== "new" ? activeNotebookId : null
  );
  const chatStream = useChatStream({
    activeNotebookId,
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
    if (!activeConversationId && conversationCRUD.conversations && conversationCRUD.conversations.length > 0) {
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

  const urlNotebookId = useMemo(() => {
    if (location.pathname.startsWith("/notebook/")) {
      return location.pathname.split("/notebook/")[1] || null;
    }
    return null;
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

  const notebookList = notebooks ?? [];
  const folderList = folders ?? [];
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
  }, [urlNotebookId, currentView]);

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

  const handleLogoClick = () => {
    navigate(isNativeShell() ? "/home" : "/");
    setActiveNotebookId(null);
  };

  const handleSelectNotebook = (notebook: NotebookItem) => {
    navigate(`/notebook/${notebook.id}`);
  };

  const handleSelectFolder = (folderId: string) => {
    navigate(`/folder/${folderId}`);
  };

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
        const wasOnlyThread =
          list != null && list.length === 1 && list[0]._id === id;
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
    <>
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
          </Routes>
        </NotebookProvider>
      </div>
    </>
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
