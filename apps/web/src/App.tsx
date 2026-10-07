import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useQuery } from "convex/react";
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { NotebookItem } from "@/shared/types/index";
import { isNativeShell } from "@/utils/platformDetection";
import { AuthProvider } from "./features/auth/AuthContext";
import { useAuthGuard } from "./features/auth/hooks/useAuthGuard";
import { useStripeRedirect } from "./features/auth/hooks/useStripeRedirect";
import { useAuth } from "./features/auth/useAuth";
import { useSubscriptionStatus } from "./features/billing/services/subscriptionApi";
import { ChatStreamingProvider } from "./features/chat/ChatStreamingContext";
import { useConversationCRUD } from "./features/chat/hooks/useConversationCRUD";
import { FeedbackModal } from "./features/feedback/components/FeedbackModal";
import { FeedbackProvider } from "./features/feedback/FeedbackContext";
import { ClusterHubLandingPage } from "./features/landing/ClusterHubLandingPage";
import { CLUSTER_HUB_PAGES, isClusterHubPath } from "./features/landing/clusterHubPages";
import { FaqPage } from "./features/landing/FaqPage";
import { IntentLandingPage } from "./features/landing/IntentLandingPage";
import { INTENT_LANDING_PAGES, isIntentLandingPath } from "./features/landing/intentLandingPages";
import { LandingPage } from "./features/landing/LandingPage";
import { SeoContentPage } from "./features/landing/SeoContentPage";
import { isSeoContentPath, SEO_CONTENT_PAGES } from "./features/landing/seoContentPages";
import { PrivacyPolicy } from "./features/legal/components/PrivacyPolicy";
import { TermsOfService } from "./features/legal/components/TermsOfService";
import { ShareNotebookModal } from "./features/notebooks/components/modals/ShareNotebookModal";
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
import { useNoteCRUD } from "./features/studio/hooks/useNoteCRUD";
import { useStudioNoteOverlay } from "./features/studio/hooks/useStudioNoteOverlay";
import { StudioProvider } from "./features/studio/StudioContext";
import { getToolPageByPath } from "./features/tools/toolPages";
import { MotionProvider } from "./shared/components/motion";
import { ProtectedRoute } from "./shared/components/ProtectedRoute";
import { RouteTransition } from "./shared/components/RouteTransition";
import { ScrollToTop } from "./shared/components/ScrollToTop";
import { Toaster } from "./shared/components/ui/sonner";
import { Spinner } from "./shared/components/ui/spinner";
import { ThemeProvider } from "./shared/contexts/ThemeContext";
import { Header } from "./shared/ui/Header";

/** Dev-only ui gallery (/dev/design). Gated on a build-time constant so production builds drop the chunk. */
const DesignGallery =
  import.meta.env.DEV || import.meta.env.VITE_DESIGN_GALLERY === "1"
    ? lazy(() => import("./dev/DesignGallery"))
    : null;

// Free tools: own chunk so the marketing shell doesn't ship pdfjs or the tool UI.
const PdfToFlashcardsPage = lazy(() => import("./features/tools/pages/PdfToFlashcardsPage"));

// App and auth routes load on demand; landing and SEO pages stay in the entry for first paint.
const AuthPage = lazy(() =>
  import("./features/auth/AuthPage").then((m) => ({ default: m.AuthPage }))
);
const HomePage = lazy(() =>
  import("./features/notebooks/components/HomePage").then((m) => ({ default: m.HomePage }))
);
const FolderView = lazy(() =>
  import("./features/notebooks/components/views/FolderView").then((m) => ({
    default: m.FolderView,
  }))
);
const NotebookView = lazy(() =>
  import("./features/notebooks/components/views/NotebookView").then((m) => ({
    default: m.NotebookView,
  }))
);
const ForkNotebookPage = lazy(() =>
  import("./features/notebooks/components/views/ForkNotebookPage").then((m) => ({
    default: m.ForkNotebookPage,
  }))
);
const BillingPage = lazy(() =>
  import("./features/billing/components/BillingPage").then((m) => ({ default: m.BillingPage }))
);
const AdminFeedbackPage = lazy(() =>
  import("./features/feedback/components/AdminFeedbackPage").then((m) => ({
    default: m.AdminFeedbackPage,
  }))
);
const LiteratureTablePage = lazy(() =>
  import("./features/studio/components/LiteratureTablePage").then((m) => ({
    default: m.LiteratureTablePage,
  }))
);
const LiteratureReportPage = lazy(() =>
  import("./features/studio/components/LiteratureReportPage").then((m) => ({
    default: m.LiteratureReportPage,
  }))
);

const routeFallback = (
  <div className="flex flex-1 items-center justify-center py-24 text-primary">
    <Spinner className="size-8" aria-hidden />
  </div>
);

const NO_DOCUMENTS: Doc<"documents">[] = [];

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
    ) ?? NO_DOCUMENTS;

  const sourceManager = useSourceManager({
    documents,
    notebookId: dataNotebookId,
  });
  const { notes, handleUpdateNote, handleDeleteNote, handleSaveReportContent } = useNoteCRUD({
    activeNotebookId: dataNotebookId,
  });
  const {
    displayNotes,
    addPendingStudioNote,
    updatePendingStudioNote,
    removePendingStudioNote,
    setOptimisticSaveNote,
  } = useStudioNoteOverlay(dataNotebookId, notes);
  const {
    conversations,
    handleCreate: handleCreateConversation,
    handleRename: handleRenameConversation,
    handleDelete: handleDeleteConversation,
  } = useConversationCRUD(dataNotebookId);
  const { handleCreateNotebook, handleUpdateNotebook, handleDeleteNotebook } = useNotebookCRUD({
    isAuthenticated,
    user,
    activeNotebookId,
    setNotebookTitle,
    onRequireAuth,
  });
  const { handleCreateFolder, handleUpdateFolder, handleDeleteFolder, handleMoveNotebookToFolder } =
    useFolderCRUD({ isAuthenticated, user, onRequireAuth });

  const subscriptionStatus = useSubscriptionStatus();

  // Auto-select the most recently updated conversation when the list loads
  useEffect(() => {
    if (!activeConversationId && conversations && conversations.length > 0) {
      setActiveConversationId(conversations[0]._id);
    }
  }, [activeConversationId, conversations]);

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
    location.pathname === "/sign-in" ||
    location.pathname === "/faq" ||
    (DesignGallery !== null && location.pathname === "/dev/design") ||
    getToolPageByPath(location.pathname) !== undefined ||
    isIntentLandingPath(location.pathname) ||
    isClusterHubPath(location.pathname) ||
    isSeoContentPath(location.pathname);
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
    if (!urlNotebookId) {
      setActiveNotebookId(null);
      setActiveConversationId(null);
    }
  }, [urlNotebookId, activeNotebookId]);

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

  const goHome = useCallback(() => navigate("/home"), [navigate]);
  const goBilling = useCallback(() => navigate("/billing"), [navigate]);

  const notebookContextValue = useMemo(
    () => ({
      featuredNotebooks,
      recentNotebooks,
      activeNotebook,
      notebooksLoading: notebooks === undefined || folders === undefined,
      urlNotebookId,
      folders: folderList,
      selectNotebook: handleSelectNotebook,
      createNotebook: handleCreateNotebook,
      updateNotebook: handleUpdateNotebook,
      deleteNotebook: handleDeleteNotebook,
      selectFolder: handleSelectFolder,
      folderBack: goHome,
      createFolder: handleCreateFolder,
      updateFolder: handleUpdateFolder,
      deleteFolder: handleDeleteFolder,
      moveNotebookToFolder: handleMoveNotebookToFolder,
      notebookTitle,
      subscriptionStatus,
      isAuthenticated,
      onRequireAuth,
    }),
    [
      featuredNotebooks,
      recentNotebooks,
      activeNotebook,
      notebooks,
      folders,
      urlNotebookId,
      folderList,
      handleSelectNotebook,
      handleCreateNotebook,
      handleUpdateNotebook,
      handleDeleteNotebook,
      handleSelectFolder,
      goHome,
      handleCreateFolder,
      handleUpdateFolder,
      handleDeleteFolder,
      handleMoveNotebookToFolder,
      notebookTitle,
      subscriptionStatus,
      isAuthenticated,
      onRequireAuth,
    ]
  );

  const handleDeleteConversationAndReselect = useCallback(
    async (id: string) => {
      const wasOnlyThread =
        conversations != null && conversations.length === 1 && conversations[0]._id === id;
      await handleDeleteConversation(id);
      if (wasOnlyThread) {
        const newId = await handleCreateConversation();
        setActiveConversationId(newId ?? null);
        return;
      }
      setActiveConversationId((current) => (current === id ? null : current));
    },
    [conversations, handleDeleteConversation, handleCreateConversation]
  );

  const {
    sources,
    handleToggleSource,
    handleToggleAll,
    handleAddSource,
    handleDeleteSource,
    handleDeleteSelectedSources,
    handleRenameSource,
  } = sourceManager;
  const sourcesContextValue = useMemo(
    () => ({
      sources,
      onToggleSource: handleToggleSource,
      onToggleAll: handleToggleAll,
      onAddSource: handleAddSource,
      onDeleteSource: handleDeleteSource,
      onDeleteSelectedSources: handleDeleteSelectedSources,
      onRenameSource: handleRenameSource,
    }),
    [
      sources,
      handleToggleSource,
      handleToggleAll,
      handleAddSource,
      handleDeleteSource,
      handleDeleteSelectedSources,
      handleRenameSource,
    ]
  );

  const studioContextValue = useMemo(
    () => ({
      notes: displayNotes,
      onUpdateNote: handleUpdateNote,
      onUpdateNoteFull: updatePendingStudioNote,
      onDeleteNote: async (id: string) => {
        removePendingStudioNote(id);
        await handleDeleteNote(id);
      },
      onAddNote: addPendingStudioNote,
      onSaveReportContent: handleSaveReportContent,
    }),
    [
      displayNotes,
      handleUpdateNote,
      updatePendingStudioNote,
      removePendingStudioNote,
      handleDeleteNote,
      addPendingStudioNote,
      handleSaveReportContent,
    ]
  );

  return (
    <OnboardingProvider key={user?.id ?? "anon"} isAuthenticated={isAuthenticated}>
      {shareModalOpen && urlNotebookId && activeNotebook && !activeNotebook.isSharedNotebook && (
        <ShareNotebookModal notebookId={urlNotebookId} onClose={() => setShareModalOpen(false)} />
      )}

      <div
        className={`w-full bg-background text-foreground font-serif ${isPublicPage ? "" : "flex flex-col h-screen overflow-hidden"}`}
      >
        {!isPublicPage && (
          <Header
            title={notebookTitle}
            onRename={(newTitle: string) => {
              setNotebookTitle(newTitle);
              if (activeNotebookId && activeNotebookId !== "new" && isAuthenticated) {
                handleUpdateNotebook(activeNotebookId, { title: newTitle });
              }
            }}
            isHome={isHomePage}
            onLogoClick={handleLogoClick}
            onBillingClick={goBilling}
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
          <RouteTransition fill={!isPublicPage}>
            <Suspense fallback={routeFallback}>
              <Routes>
                <Route path="/" element={<LandingPage onGetStarted={goHome} />} />
                <Route path="/sign-in" element={<AuthPage />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route
                  path="/tools/pdf-to-flashcards"
                  element={
                    <Suspense fallback={<div className="min-h-screen bg-background" />}>
                      <PdfToFlashcardsPage />
                    </Suspense>
                  }
                />
                {DesignGallery && (
                  <Route
                    path="/dev/design"
                    element={
                      <Suspense fallback={null}>
                        <DesignGallery />
                      </Suspense>
                    }
                  />
                )}

                {CLUSTER_HUB_PAGES.map((page) => (
                  <Route
                    key={page.path}
                    path={page.path}
                    element={<ClusterHubLandingPage pagePath={page.path} />}
                  />
                ))}

                {INTENT_LANDING_PAGES.map((page) => (
                  <Route
                    key={page.path}
                    path={page.path}
                    element={<IntentLandingPage pagePath={page.path} />}
                  />
                ))}

                {SEO_CONTENT_PAGES.map((page) => (
                  <Route
                    key={page.path}
                    path={page.path}
                    element={<SeoContentPage pagePath={page.path} />}
                  />
                ))}

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
                        <BillingPage onBack={goHome} />
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
                        activeNotebookId={dataNotebookId}
                        sources={sources}
                        documents={documents}
                        activeConversationId={activeConversationId}
                        conversations={conversations}
                        onSelectConversation={setActiveConversationId}
                        onCreateConversation={handleCreateConversation}
                        onRenameConversation={handleRenameConversation}
                        onDeleteConversation={handleDeleteConversationAndReselect}
                        onSaveChatOptimistic={setOptimisticSaveNote}
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
            </Suspense>
          </RouteTransition>
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
        <ScrollToTop />
        <ThemeProvider>
          <MotionProvider>
            <AuthProvider>
              <FeedbackProvider>
                <AppContent />
                <FeedbackModal />
              </FeedbackProvider>
              <Toaster position="bottom-right" />
            </AuthProvider>
          </MotionProvider>
        </ThemeProvider>
      </BrowserRouter>
    </>
  );
};

export default App;
