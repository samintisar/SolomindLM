import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Id, type Doc } from '@convex/_generated/dataModel';
import { Header } from './shared/ui/Header';
import { SourcesPanel } from './features/sources/components/SourcesPanel';
import { ChatPanel } from './features/chat/components/ChatPanel';
import { StudioPanel } from './features/studio/components/StudioPanel';
import { HomePage } from './features/notebooks/components/HomePage';
import { FolderView } from './features/notebooks/components/views/FolderView';
import { NotebookProvider } from './features/notebooks/NotebookContext';
import { ChatStreamingProvider } from './features/chat/ChatStreamingContext';
import { SourcesProvider } from './features/sources/SourcesContext';
import { StudioProvider } from './features/studio/StudioContext';
import { BillingPage } from './features/billing/components/BillingPage';
import { LandingPage } from './features/landing/LandingPage';
import { useAuth, AuthProvider } from './features/auth/AuthContext';
import { LoginModal } from './features/auth/components/LoginModal';
import { ThemeProvider } from './shared/contexts/ThemeContext';
import { ToastProvider } from './shared/contexts/ToastContext';
import { ToastContainer } from './shared/components/ToastContainer';
import { ProtectedRoute } from './shared/components/ProtectedRoute';
import { PrivacyPolicy } from './features/legal/components/PrivacyPolicy';
import { TermsOfService } from './features/legal/components/TermsOfService';
import { STUDIO_TOOLS } from './shared/constants';
import { Source, Note, NotebookItem, Message, FolderItem } from '@/shared/types/index';
import { documentToSource } from './shared/utils/documentToSource';
import { useNotes } from './features/studio/services/notesApi';
import { useUpdateReport, useDeleteReport } from './features/studio/services/reportsApi';
import { useRenameFlashcards, useDeleteFlashcards } from './features/studio/services/flashcardsApi';
import { useRenameQuiz, useDeleteQuiz } from './features/studio/services/quizzesApi';
import { useRenameMindMap, useDeleteMindMap } from './features/studio/services/mindMapApi';
import { useUpdateAudioOverview, useDeleteAudioOverview } from './features/studio/services/audioApi';
import { useRenameWrittenQuestions, useDeleteWrittenQuestions } from './features/studio/services/writtenQuestionsApi';
import { useRenameSlideDeck, useDeleteSlideDeck } from './features/studio/services/slidesApi';
import { useRenameSpreadsheet, useDeleteSpreadsheet } from './features/studio/services/spreadsheetsApi';
import { useUpdateUserNote, useDeleteUserNote } from './features/chat/services/userNotesApi';
import { useNotebooks, useCreateNotebook, useUpdateNotebook, useDeleteNotebook } from './features/notebooks/services/notebooksApi';
import { useFolders, useCreateFolder, useUpdateFolder, useDeleteFolder } from './features/notebooks/services/foldersApi';
import { useGenerateUploadUrl, useCreateDocument, useUpdateDocument, useDeleteDocument } from './features/sources/services/documentsApi';
import { useSubscriptionStatus } from './features/billing/services/subscriptionApi';
import { useSendMessage, useSetMessageFeedback, useSourceSuggestions } from './features/chat/services/chatApi';
import { useLimitErrorToast } from './shared/hooks/useLimitErrorToast';
import 'mind-elixir/style.css';

const MIN_PANEL_WIDTH = 220;
const getMaxPanelWidth = () => Math.min(window.innerWidth * 0.7, 1400);

const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Convex hooks for notebooks and folders
  const notebooks = useNotebooks();
  const folders = useFolders();
  const documents = useQuery(
    api.documents.index.list,
    activeNotebookId && activeNotebookId !== 'new'
      ? { notebookId: activeNotebookId as Id<'notebooks'> }
      : 'skip'
  ) ?? [];
  const messages = useQuery(
    api.chat.messages.listByNotebook,
    activeNotebookId && activeNotebookId !== 'new'
      ? { notebookId: activeNotebookId as Id<'notebooks'> }
      : 'skip'
  ) ?? [];
  const notes = useNotes(
    activeNotebookId && activeNotebookId !== 'new' ? activeNotebookId : null
  );

  // Mutation hooks
  const createNotebook = useCreateNotebook();
  const updateNotebook = useUpdateNotebook();
  const deleteNotebook = useDeleteNotebook();
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  useGenerateUploadUrl();
  useCreateDocument();
  const updateDocument = useUpdateDocument();
  const deleteDocumentMutation = useDeleteDocument();
  const clearChatHistoryMutation = useMutation(api.chat.messages.clearHistory);
  const deleteMessagesFromMutation = useMutation(api.chat.messages.deleteMessagesFrom);

  // Studio note update/delete (reports, flashcards, quizzes, etc.)
  const updateReport = useUpdateReport();
  const deleteReport = useDeleteReport();
  const renameFlashcards = useRenameFlashcards();
  const deleteFlashcards = useDeleteFlashcards();
  const renameQuiz = useRenameQuiz();
  const deleteQuiz = useDeleteQuiz();
  const renameMindMap = useRenameMindMap();
  const deleteMindMap = useDeleteMindMap();
  const updateAudioOverview = useUpdateAudioOverview();
  const deleteAudioOverview = useDeleteAudioOverview();
  const renameWrittenQuestions = useRenameWrittenQuestions();
  const deleteWrittenQuestions = useDeleteWrittenQuestions();
  const renameSlideDeck = useRenameSlideDeck();
  const deleteSlideDeck = useDeleteSlideDeck();
  const renameSpreadsheet = useRenameSpreadsheet();
  const deleteSpreadsheet = useDeleteSpreadsheet();
  const updateUserNote = useUpdateUserNote();
  const deleteUserNote = useDeleteUserNote();

  // Determine current view from URL
  const isPublicPage = location.pathname === '/' || location.pathname === '/privacy' || location.pathname === '/terms';
  const isHomePage = location.pathname === '/home' || location.pathname === '/billing' || location.pathname.startsWith('/folder/');

  const currentView = useMemo(() => {
    if (location.pathname === '/') return 'landing';
    if (location.pathname === '/home') return 'home';
    if (location.pathname === '/billing') return 'billing';
    if (location.pathname.startsWith('/folder/')) return 'folder';
    if (location.pathname.startsWith('/notebook/')) return 'notebook';
    return 'landing';
  }, [location.pathname]);

  // Get notebook ID from URL pathname (e.g., /notebook/abc-123 -> abc-123)
  const urlNotebookId = useMemo(() => {
    if (location.pathname.startsWith('/notebook/')) {
      return location.pathname.split('/notebook/')[1] || null;
    }
    return null;
  }, [location.pathname]);

  // Get folder ID from URL pathname
  const urlFolderId = useMemo(() => {
    if (location.pathname.startsWith('/folder/')) {
      return location.pathname.split('/folder/')[1] || null;
    }
    return null;
  }, [location.pathname]);

  // Notebook specific state
  const [isSourcesOpen, setIsSourcesOpen] = useState(true);
  const [isStudioOpen, setIsStudioOpen] = useState(true);
  const [mobileActiveTab, setMobileActiveTab] = useState<'sources' | 'chat' | 'studio'>('sources');
  const [sources, setSources] = useState<Source[]>([]);
  const [notebookTitle, setNotebookTitle] = useState("Notebook");
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReferences, setStreamingReferences] = useState<unknown[] | null>(null);
  const [streamingJustFinished, setStreamingJustFinished] = useState(false);
  const [streamingToolCalls, setStreamingToolCalls] = useState<import('./shared/types/index').MessageToolCall[]>([]);
  const [lastAssistantFollowUps, setLastAssistantFollowUps] = useState<string[] | null>(null);
  const messagesLengthWhenStreamCompleteRef = useRef(0);
  /** Latest messages for stream callbacks (avoids stale closure on `messages.length`). */
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /** Wall-clock ms when current stream started; used to detect stuck UI after DB already has the reply. */
  const streamStartedAtRef = useRef<number | null>(null);

  // Mini Audio Player state
  const [miniPlayerVisible, setMiniPlayerVisible] = useState(false);
  const [miniPlayerData, setMiniPlayerData] = useState<{
    audioUrl: string;
    title: string;
    transcript?: string;
  } | null>(null);

  // Optimistic UI: saved-chat placeholder shown in notes list until save completes
  const [optimisticSaveNote, setOptimisticSaveNote] = useState<{ notebookId: string; note: Note } | null>(null);
  const displayNotes = useMemo(() => {
    if (!optimisticSaveNote || optimisticSaveNote.notebookId !== activeNotebookId) return notes;
    return [optimisticSaveNote.note, ...notes];
  }, [notes, optimisticSaveNote, activeNotebookId]);

  // Subscription status
  const subscriptionStatus = useSubscriptionStatus();

  // Limit error handling
  const { handleLimitError } = useLimitErrorToast();

  // Chat: stream messages with optimistic updates
  const sendChatMessage = useSendMessage();
  const setMessageFeedback = useSetMessageFeedback();

  // Source-aware chat suggestions
  const sourceSuggestions = useSourceSuggestions(
    activeNotebookId && activeNotebookId !== 'new' ? activeNotebookId : null,
    documents
  );
  const sourceCount = useMemo(
    () => documents.filter((d: any) => d.status === 'completed').length,
    [documents]
  );

  // Filter notebooks for home page (notebooks may be undefined while loading)
  const notebookList = notebooks ?? [];
  const featuredNotebooks = useMemo(() => notebookList.filter((nb: NotebookItem) => nb.isFeatured), [notebookList]);
  const recentNotebooks = useMemo(() => notebookList.filter((nb: NotebookItem) => !nb.isFeatured), [notebookList]);
  const activeNotebook = useMemo(() => {
    if (!urlNotebookId || notebookList.length === 0) return undefined;
    return notebookList.find((nb: NotebookItem) => nb.id === urlNotebookId);
  }, [urlNotebookId, notebookList]);

  // Resize State
  const [leftWidth, setLeftWidth] = useState(360);
  const [rightWidth, setRightWidth] = useState(420);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Use a ref to track previous documents for comparison
  const prevDocumentsRef = useRef<any[]>([]);

  // Sync activeNotebookId with URL params
  useEffect(() => {
    if (urlNotebookId && urlNotebookId !== activeNotebookId) {
      setActiveNotebookId(urlNotebookId);
    }
    if (!urlNotebookId && currentView !== 'notebook') {
      setActiveNotebookId(null);
    }
  }, [urlNotebookId, currentView]);

  // Update notebook title when the notebook changes
  useEffect(() => {
    if (urlNotebookId && notebookList.length > 0) {
      const notebook = notebookList.find((nb: NotebookItem) => nb.id === urlNotebookId);
      if (notebook) {
        setNotebookTitle(notebook.title);
      }
    }
  }, [urlNotebookId, notebookList]);

  // Sync sources with documents from Convex (updates when documents change, including status and title)
  useEffect(() => {
    // Include fileName in signature so title updates from DocEmbeddingJob (e.g. YouTube placeholder -> real title) trigger a re-sync
    const currentSignature = documents.map((d: Doc<'documents'>) => `${d._id}:${d.status}:${d.fileName}`).join(',');
    const prevSignature = prevDocumentsRef.current.map((d: Doc<'documents'>) => `${d._id}:${d.status}:${d.fileName}`).join(',');

    if (currentSignature !== prevSignature) {
      // Preserve selection state when updating
      setSources(prev => {
        const newSources = documents.map(documentToSource);
        // Merge selection state from previous sources
        return newSources.map((source: Source) => ({
          ...source,
          selected: prev.find(s => s.id === source.id)?.selected ?? true,
        }));
      });
      prevDocumentsRef.current = documents;
    }
  }, [documents]);

  const toggleSources = () => setIsSourcesOpen(!isSourcesOpen);
  const toggleStudio = () => setIsStudioOpen(!isStudioOpen);

  /** Reset all streaming state to idle. */
  const resetStreamingState = () => {
    setIsChatStreaming(false);
    setStreamingContent('');
    setStreamingReferences(null);
    setStreamingJustFinished(false);
    setStreamingToolCalls([]);
    streamStartedAtRef.current = null;
  };

  const handleClearChatHistory = async () => {
    if (!activeNotebookId || activeNotebookId === 'new') return;
    try {
      await clearChatHistoryMutation({
        notebookId: activeNotebookId as Id<'notebooks'>,
      });
      resetStreamingState();
    } catch (error) {
      console.error('Failed to clear chat history', error);
      resetStreamingState();
    }
  };

  // Handle sending a chat message — only uses the user's selected sources
  const handleSendMessage = async (messageText: string) => {
    if (!activeNotebookId || isChatStreaming) return;

    streamStartedAtRef.current = Date.now();
    setIsChatStreaming(true);
    setStreamingContent('');
    setStreamingReferences(null);
    const selectedDocumentIds = sources
      .filter((source) => source.selected)
      .map((source) => source.id);

    setStreamingToolCalls([]);
    setLastAssistantFollowUps(null);

    const onStreamComplete = () => {
      setIsChatStreaming(false);
      setStreamingJustFinished(true);
      setStreamingToolCalls([]);
      // Convex `messages` can lag one frame behind this callback; `0` breaks cleanup (use sentinel).
      const len = messagesRef.current.length;
      messagesLengthWhenStreamCompleteRef.current = len > 0 ? len : -1;
      streamStartedAtRef.current = null;
    };

    try {
      await sendChatMessage(
        activeNotebookId,
        messageText,
        {
          onToken: (token) => setStreamingContent((prev) => prev + token),
          onReferences: (refs) => setStreamingReferences(refs),
          onStatus: () => {},
          onToolCall: (tc) => setStreamingToolCalls((prev) => {
            const existing = prev.findIndex((c) => c.query === tc.query && c.tool === tc.tool);
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = tc;
              return next;
            }
            return [...prev, tc];
          }),
          onFollowUps: (qs) => setLastAssistantFollowUps(qs),
          onComplete: onStreamComplete,
          onError: resetStreamingState,
        },
        selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined
      );
    } catch {
      resetStreamingState();
    }
  };

  // Once stream completes, keep showing streaming content until DB has the new assistant message, then clear to avoid duplicate/flash
  useEffect(() => {
    const refLen = messagesLengthWhenStreamCompleteRef.current;
    if (
      streamingJustFinished &&
      (messages.length >= refLen || refLen < 0) &&
      messages[messages.length - 1]?.role === 'assistant'
    ) {
      setStreamingContent('');
      setStreamingReferences(null);
      setStreamingJustFinished(false);
    }
  }, [streamingJustFinished, messages]);

  // If the HTTP stream never signals completion, isChatStreaming can stay true while the full answer
  // is already shown (and saved). Input stays "loading" even though the bubble looks done. When the
  // persisted assistant matches what we streamed, force the same cleanup as onStreamComplete.
  useEffect(() => {
    if (!isChatStreaming || !streamingContent.trim()) return;
    const last = messages[messages.length - 1];
    if (last?.role !== 'assistant' || !last.content) return;
    if (last.content.trimEnd() !== streamingContent.trimEnd()) return;

    setIsChatStreaming(false);
    setStreamingToolCalls([]);
    setStreamingJustFinished(true);
    messagesLengthWhenStreamCompleteRef.current = messages.length - 1;
  }, [isChatStreaming, streamingContent, messages]);

  // Convex can persist the assistant before the HTTP client finishes (e.g. slow follow-up phase). If the
  // UI still thinks we're streaming with an empty buffer, drop the ghost "thinking/searching" row and unlock input.
  useEffect(() => {
    if (!isChatStreaming || streamingContent.trim()) return;
    const t0 = streamStartedAtRef.current;
    if (t0 == null) return;
    const n = messages.length;
    if (n < 2) return;
    const assistant = messages[n - 1] as Doc<'messages'>;
    const user = messages[n - 2] as Doc<'messages'>;
    if (assistant?.role !== 'assistant' || user?.role !== 'user') return;
    const assistantText =
      typeof assistant.content === 'string' ? assistant.content : String(assistant.content ?? '');
    if (!assistantText.trim()) return;
    // Allow clock skew between client `Date.now()` and server `createdAt` (ms).
    const SKEW_MS = 120_000;
    if (typeof assistant.createdAt !== 'number' || assistant.createdAt < t0 - SKEW_MS) return;

    resetStreamingState();
  }, [isChatStreaming, streamingContent, messages]);

  // Chat list: DB messages + in-flight streaming assistant message so tokens appear as they arrive
  const chatDisplayMessages = useMemo((): Message[] => {
    const list: Message[] = messages.map((msg: Doc<'messages'>, index: number) => ({
      id: msg._id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: new Date(msg.createdAt as number),
      references: msg.references,
      feedback: (msg as any).feedback as 'up' | 'down' | undefined,
      // Attach follow-ups to last DB assistant message when stream just finished
      followUps: (
        !streamingContent &&
        msg.role === 'assistant' &&
        index === messages.length - 1 &&
        lastAssistantFollowUps
      ) ? lastAssistantFollowUps : undefined,
    }));
    const t0 = streamStartedAtRef.current;
    const last = messages[messages.length - 1] as Doc<'messages'> | undefined;
    const prev = messages[messages.length - 2] as Doc<'messages'> | undefined;
    const SKEW_MS = 120_000;
    const lastAssistantText =
      last?.content == null
        ? ''
        : typeof last.content === 'string'
          ? last.content
          : String(last.content);
    const ghostStuckAssistantRow =
      isChatStreaming &&
      !streamingContent.trim() &&
      t0 != null &&
      last?.role === 'assistant' &&
      prev?.role === 'user' &&
      !!lastAssistantText.trim() &&
      typeof last.createdAt === 'number' &&
      last.createdAt >= t0 - SKEW_MS;

    if ((isChatStreaming || streamingContent) && !ghostStuckAssistantRow) {
      list.push({
        id: '__streaming__',
        role: 'assistant',
        content: streamingContent,
        timestamp: new Date(),
        references: (streamingReferences as Message['references']) ?? undefined,
        toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : undefined,
        status: streamingContent ? undefined : 'thinking',
      });
    }
    return list;
  }, [messages, streamingContent, streamingReferences, streamingToolCalls, lastAssistantFollowUps, isChatStreaming]);

  const handleRetryMessage = useCallback(async (assistantMessageId: string) => {
    if (isChatStreaming) return;
    const idx = chatDisplayMessages.findIndex((m) => m.id === assistantMessageId);
    if (idx < 0) return;

    // Find the user message that preceded this assistant message
    let userContent = '';
    let userMessageId: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (chatDisplayMessages[i].role === 'user') {
        userContent = chatDisplayMessages[i].content;
        userMessageId = chatDisplayMessages[i].id;
        break;
      }
    }
    if (!userContent || !userMessageId) return;

    // Delete from the user message onward (user msg + assistant msg + anything after)
    await deleteMessagesFromMutation({ messageId: userMessageId as Id<'messages'> });

    // Re-send to generate a fresh response
    handleSendMessage(userContent);
  }, [chatDisplayMessages, isChatStreaming, handleSendMessage, deleteMessagesFromMutation]);

  const handleToggleSource = (id: string) => {
    setSources(prev => prev.map(source =>
      source.id === id ? { ...source, selected: !source.selected } : source
    ));
  };

  const handleToggleAll = () => {
    const allSelected = sources.every(s => s.selected);
    setSources(prev => prev.map(source => ({ ...source, selected: !allSelected })));
  };

  const handleAddSource = (source: Source) => {
    setSources(prev => [source, ...prev]);
  };

  const handleUpdateNote = async (id: string, newTitle: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note || !newTitle.trim()) return;
    try {
      switch (note.type) {
        case 'report':
          await updateReport(id, { title: newTitle.trim() });
          break;
        case 'flashcard':
          await renameFlashcards(id, newTitle.trim());
          break;
        case 'quiz':
          await renameQuiz(id, newTitle.trim());
          break;
        case 'mindmap':
          await renameMindMap(id, newTitle.trim());
          break;
        case 'audio':
          await updateAudioOverview(id, { title: newTitle.trim() });
          break;
        case 'writtenQuestions':
          await renameWrittenQuestions(id, newTitle.trim());
          break;
        case 'slides':
          await renameSlideDeck(id, newTitle.trim());
          break;
        case 'spreadsheet':
          await renameSpreadsheet(id, newTitle.trim());
          break;
        case 'note':
          await updateUserNote(id, { title: newTitle.trim() });
          break;
        default:
          console.warn('Unknown note type for update:', (note as Note).type);
      }
    } catch (error) {
      console.error('Failed to update note:', error);
      alert(error instanceof Error ? error.message : 'Failed to update note');
    }
  };

  const handleUpdateNoteFull = (_id: string, _note: Note) => {
    // Notes will be automatically updated via Convex query reactivity
  };

  const handleSaveReportContent = async (reportId: string, content: string) => {
    await updateReport(reportId, { content });
  };

  const handleDeleteNote = async (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    try {
      switch (note.type) {
        case 'report':
          await deleteReport(id);
          break;
        case 'flashcard':
          await deleteFlashcards(id);
          break;
        case 'quiz':
          await deleteQuiz(id);
          break;
        case 'mindmap':
          await deleteMindMap(id);
          break;
        case 'audio':
          await deleteAudioOverview(id);
          break;
        case 'writtenQuestions':
          await deleteWrittenQuestions(id);
          break;
        case 'slides':
          await deleteSlideDeck(id);
          break;
        case 'spreadsheet':
          await deleteSpreadsheet(id);
          break;
        case 'note':
          await deleteUserNote(id);
          break;
        default:
          console.warn('Unknown note type for delete:', (note as Note).type);
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete note');
    }
  };

  const handleAddNote = (_note: Note) => {
    // Notes will be automatically added via Convex query reactivity
  };

  const handleUpdateNotebook = async (id: string, updates: Partial<NotebookItem>) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot update notebook: not authenticated');
      return;
    }

    try {
      const updatePayload: any = {};
      if (updates.title !== undefined) updatePayload.title = updates.title;
      if (updates.coverColor !== undefined) updatePayload.coverColor = updates.coverColor;
      if (updates.icon !== undefined) updatePayload.icon = updates.icon;
      if (updates.isFeatured !== undefined) updatePayload.isFeatured = updates.isFeatured;

      await updateNotebook(id, updatePayload);

      if (activeNotebookId === id && updates.title) {
        setNotebookTitle(updates.title);
      }
    } catch (error) {
      console.error('Failed to update notebook:', error);
      alert(error instanceof Error ? error.message : 'Failed to update notebook');
    }
  };

  const handleDeleteNotebook = async (id: string) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot delete notebook: not authenticated');
      return;
    }

    try {
      await deleteNotebook(id);
      if (activeNotebookId === id) {
        handleLogoClick();
      }
    } catch (error) {
      console.error('Failed to delete notebook:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete notebook');
    }
  };

  const startResizingLeft = useCallback(() => setIsResizingLeft(true), []);
  const startResizingRight = useCallback(() => setIsResizingRight(true), []);
  const stopResizing = useCallback(() => {
    setIsResizingLeft(false);
    setIsResizingRight(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      const maxWidth = getMaxPanelWidth();
      if (isResizingLeft) {
        const newWidth = mouseMoveEvent.clientX;
        if (newWidth >= MIN_PANEL_WIDTH && newWidth <= maxWidth) {
          setLeftWidth(newWidth);
        }
      }
      if (isResizingRight) {
        const newWidth = window.innerWidth - mouseMoveEvent.clientX;
        if (newWidth >= MIN_PANEL_WIDTH && newWidth <= maxWidth) {
          setRightWidth(newWidth);
        }
      }
    },
    [isResizingLeft, isResizingRight]
  );

  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingLeft, isResizingRight, resize, stopResizing]);

  // Listen for panel resize events from child components
  useEffect(() => {
    const handleSourcesPanelResize = (e: Event) => {
      const customEvent = e as CustomEvent;
      setLeftWidth(customEvent.detail.width);
    };

    const handleStudioPanelResize = (e: Event) => {
      const customEvent = e as CustomEvent;
      setRightWidth(customEvent.detail.width);
    };

    window.addEventListener('resizeSourcesPanel', handleSourcesPanelResize);
    window.addEventListener('resizeStudioPanel', handleStudioPanelResize);

    return () => {
      window.removeEventListener('resizeSourcesPanel', handleSourcesPanelResize);
      window.removeEventListener('resizeStudioPanel', handleStudioPanelResize);
    };
  }, []);

  // Handle redirect from Stripe checkout (go to billing and clear query so subscription state can load)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');

    if ((success === 'true' || canceled === 'true') && isAuthenticated && user) {
      navigate('/billing', { replace: true });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [isAuthenticated, user, navigate]);

  // Handle source deletion
  const handleDeleteSource = useCallback(async (sourceId: string) => {
    try {
      setSources(prev => prev.filter(s => s.id !== sourceId));
      await deleteDocumentMutation(sourceId);
    } catch (error) {
      console.error('Failed to delete source:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete source');
    }
  }, [deleteDocumentMutation]);

  // Handle source rename
  const handleRenameSource = useCallback(async (sourceId: string, newTitle: string) => {
    try {
      setSources(prev => prev.map(s => s.id === sourceId ? { ...s, title: newTitle } : s));
      await updateDocument(sourceId, { title: newTitle });
    } catch (error) {
      console.error('Failed to rename source:', error);
      alert(error instanceof Error ? error.message : 'Failed to rename source');
    }
  }, [updateDocument]);

  // Redirect authenticated users from landing (/) to /home (skip when returning from Stripe so success handler can send to /billing)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromStripe = params.get('success') === 'true' || params.get('canceled') === 'true';
    if (!isLoading && isAuthenticated && location.pathname === '/' && !fromStripe) {
      navigate('/home', { replace: true });
    }
  }, [isLoading, isAuthenticated, location.pathname, location.search, navigate]);

  // Show login modal only for protected routes when not authenticated
  useEffect(() => {
    const isProtectedRoute =
      location.pathname === '/billing' ||
      location.pathname.startsWith('/notebook/');

    if (!isLoading && !isAuthenticated && isProtectedRoute) {
      setShowLoginModal(true);
    } else if (isAuthenticated) {
      setShowLoginModal(false);
    }
  }, [isAuthenticated, isLoading, location.pathname]);

  // Navigation Handlers
  const handleLogoClick = () => {
    navigate('/');
    setActiveNotebookId(null);
  };

  const handleGetStarted = () => {
    navigate('/home');
  };

  const handleBillingClick = () => {
    navigate('/billing');
  };

  const handleBillingBack = () => {
    navigate('/home');
  };

  const handleSelectNotebook = (notebook: NotebookItem) => {
    navigate(`/notebook/${notebook.id}`);
  };

  const handleSelectFolder = (folderId: string) => {
    navigate(`/folder/${folderId}`);
  };

  const handleFolderBack = () => {
    navigate('/home');
  };

  const handleCreateNotebook = async () => {
    if (!isAuthenticated || !user) {
      console.error('Cannot create notebook: not authenticated');
      return;
    }

    try {
      const newNotebook = await createNotebook({
        title: 'Untitled Notebook',
        coverColor: 'bg-yellow-500',
        icon: 'Folder',
      });

      navigate(`/notebook/${newNotebook.id}`);
    } catch (error) {
      console.error('Failed to create notebook:', error);
      const handled = await handleLimitError(error);
      if (!handled.isLimitError) {
        alert(error instanceof Error ? error.message : 'Failed to create notebook');
      }
    }
  };

  const handleCreateFolder = async () => {
    if (!isAuthenticated || !user) {
      console.error('Cannot create folder: not authenticated');
      return;
    }

    try {
      await createFolder({
        name: 'New Folder',
        color: 'bg-blue-500',
        icon: 'Folder',
      });
    } catch (error) {
      console.error('Failed to create folder:', error);
      alert(error instanceof Error ? error.message : 'Failed to create folder');
    }
  };

  const handleUpdateFolder = async (id: string, updates: Partial<FolderItem>) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot update folder: not authenticated');
      return;
    }

    try {
      await updateFolder(id, {
        name: updates.name,
        description: updates.description,
        color: updates.color,
        icon: updates.icon,
      });
    } catch (error) {
      console.error('Failed to update folder:', error);
      alert(error instanceof Error ? error.message : 'Failed to update folder');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot delete folder: not authenticated');
      return;
    }

    try {
      await deleteFolder(id);
    } catch (error) {
      console.error('Failed to delete folder:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete folder');
    }
  };

  const handleMoveNotebookToFolder = async (notebookId: string, folderId: string | null) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot move notebook: not authenticated');
      return;
    }

    try {
      await updateNotebook(notebookId, { folderId });
    } catch (error) {
      console.error('Failed to move notebook:', error);
      alert(error instanceof Error ? error.message : 'Failed to move notebook');
    }
  };

  const handlePlayAudio = (audioUrl: string, title: string, transcript?: string, noteId?: string) => {
    setMiniPlayerData({ audioUrl, title, transcript });
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
      const note = notes.find(n => n.id === noteId);
      if (note) {
        const event = new CustomEvent('setActiveNote', { detail: { noteId } });
        window.dispatchEvent(event);
      }
    }
  };

  // NotebookContext value (pass-through — AppContent owns the state)
  const notebookContextValue = useMemo(() => ({
    notebookList,
    featuredNotebooks,
    recentNotebooks,
    activeNotebook,
    urlNotebookId,
    urlFolderId,
    currentView,
    folders,
    selectNotebook: handleSelectNotebook,
    createNotebook: handleCreateNotebook,
    updateNotebook: handleUpdateNotebook,
    deleteNotebook: handleDeleteNotebook,
    selectFolder: handleSelectFolder,
    folderBack: handleFolderBack,
    createFolder: handleCreateFolder,
    updateFolder: handleUpdateFolder,
    deleteFolder: handleDeleteFolder,
    moveNotebookToFolder: handleMoveNotebookToFolder,
    logoClick: handleLogoClick,
    getStarted: handleGetStarted,
    billingClick: handleBillingClick,
    billingBack: handleBillingBack,
    notebookTitle,
    setNotebookTitle,
    subscriptionStatus,
    onRequireAuth: (errorMessage: string) => {
      setAuthError(errorMessage);
      setShowLoginModal(true);
    },
  }), [
    notebookList, featuredNotebooks, recentNotebooks, activeNotebook,
    urlNotebookId, urlFolderId, currentView, folders,
    handleSelectNotebook, handleCreateNotebook, handleUpdateNotebook, handleDeleteNotebook,
    handleSelectFolder, handleFolderBack, handleCreateFolder, handleUpdateFolder, handleDeleteFolder,
    handleMoveNotebookToFolder, handleLogoClick, handleGetStarted, handleBillingClick, handleBillingBack,
    notebookTitle, subscriptionStatus,
  ]);

  const chatStreamingContextValue = useMemo(() => ({
    messages: chatDisplayMessages,
    isChatStreaming,
    onSendMessage: handleSendMessage,
    onClearHistory: handleClearChatHistory,
    onSetFeedback: setMessageFeedback,
    onRetry: handleRetryMessage,
    onSaveChatOptimistic: setOptimisticSaveNote,
    sourceCount,
    sourceSummary: sourceSuggestions.summary,
    suggestions: sourceSuggestions.suggestions,
    isLoadingSuggestions: sourceSuggestions.isLoading,
  }), [
    chatDisplayMessages, isChatStreaming, handleSendMessage, handleClearChatHistory,
    setMessageFeedback, handleRetryMessage, sourceCount, sourceSuggestions,
  ]);

  const sourcesContextValue = useMemo(() => ({
    sources,
    onToggleSource: handleToggleSource,
    onToggleAll: handleToggleAll,
    onAddSource: handleAddSource,
    onDeleteSource: handleDeleteSource,
    onRenameSource: handleRenameSource,
  }), [sources, handleToggleSource, handleToggleAll, handleAddSource, handleDeleteSource, handleRenameSource]);

  const studioContextValue = useMemo(() => ({
    notes: displayNotes,
    onUpdateNote: handleUpdateNote,
    onUpdateNoteFull: handleUpdateNoteFull,
    onDeleteNote: handleDeleteNote,
    onAddNote: handleAddNote,
    onSaveReportContent: handleSaveReportContent,
  }), [displayNotes, handleUpdateNote, handleUpdateNoteFull, handleDeleteNote, handleAddNote, handleSaveReportContent]);

  return (
    <>
      {showLoginModal && !isAuthenticated && (
        <LoginModal
          onClose={() => {
            setShowLoginModal(false);
            setAuthError(null);
          }}
          authError={authError || undefined}
        />
      )}

      <div className={`w-full bg-background text-foreground font-serif ${isPublicPage ? '' : 'flex flex-col h-screen overflow-hidden'}`}>
      {!isPublicPage && (
        <Header
          title={notebookTitle}
          onRename={(newTitle: string) => {
            setNotebookTitle(newTitle);
            if (activeNotebookId && activeNotebookId !== 'new' && isAuthenticated) {
              handleUpdateNotebook(activeNotebookId, { title: newTitle });
            }
          }}
          isHome={isHomePage}
          onLogoClick={handleLogoClick}
          onBillingClick={handleBillingClick}
          hasSubscription={subscriptionStatus.hasSubscription}
        />
      )}

      <NotebookProvider value={notebookContextValue}>
      <Routes>
        <Route path="/" element={<LandingPage onGetStarted={handleGetStarted} />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />

        <Route
          path="/home"
          element={<HomePage />}
        />

        <Route
          path="/folder/:folderId"
          element={
            <ProtectedRoute>
              <main className="flex-1 overflow-auto">
                <FolderView
                  folderId={urlFolderId || ''}
                  viewMode="grid"
                />
              </main>
            </ProtectedRoute>
          }
        />

        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <main className="flex-1 overflow-auto">
                <BillingPage onBack={handleBillingBack} />
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
              <main className="flex-1 flex flex-col overflow-hidden relative animate-in fade-in duration-300">
                {/* Mobile Navigation Bar */}
                <div className="md:hidden flex items-center justify-around border-b border-border bg-background sticky top-0 z-60 h-12">
                  <button
                    onClick={() => setMobileActiveTab('sources')}
                    className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
                      mobileActiveTab === 'sources'
                        ? 'text-primary border-b-2 border-primary bg-primary/5'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Sources
                  </button>
                  <div className="w-px h-6 bg-border"></div>
                  <button
                    onClick={() => setMobileActiveTab('chat')}
                    className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
                      mobileActiveTab === 'chat'
                        ? 'text-primary border-b-2 border-primary bg-primary/5'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Chat
                  </button>
                  <div className="w-px h-6 bg-border"></div>
                  <button
                    onClick={() => setMobileActiveTab('studio')}
                    className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
                      mobileActiveTab === 'studio'
                        ? 'text-primary border-b-2 border-primary bg-primary/5'
                        : 'text-muted-foreground hover:text-foreground'
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
                    noteId={activeNotebookId}
                    onDocumentUploaded={() => {}}
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
                    notebookId={activeNotebookId}
                    notebookTitle={notebookTitle}
                    notebookIcon={activeNotebook?.icon}
                    notebookCoverColor={activeNotebook?.coverColor}
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
                    noteId={activeNotebookId}
                    onPlayAudio={handlePlayAudio}
                    miniPlayerVisible={miniPlayerVisible}
                    miniPlayerData={miniPlayerData}
                    onCloseMiniPlayer={handleCloseMiniPlayer}
                    onExpandAudioPlayer={handleExpandAudioPlayer}
                  />
                </div>

                {/* Mobile Layout */}
                <div className="md:hidden flex-1 overflow-hidden w-full flex flex-col">
                  {mobileActiveTab === 'sources' && (
                    <div className="flex-1 w-full overflow-hidden">
                      <SourcesPanel
                        isOpen={true}
                        onClose={() => {}}
                        width={390}
                        isResizing={false}
                        userId={user?.id}
                        noteId={activeNotebookId}
                        onDocumentUploaded={() => {}}
                      />
                    </div>
                  )}
                  {mobileActiveTab === 'chat' && (
                    <div className="flex-1 w-full overflow-hidden">
                      <ChatPanel
                        isLeftOpen={false}
                        isRightOpen={false}
                        toggleLeft={() => {}}
                        toggleRight={() => {}}
                        notebookId={activeNotebookId}
                        notebookTitle={notebookTitle}
                        notebookIcon={activeNotebook?.icon}
                        notebookCoverColor={activeNotebook?.coverColor}
                      />
                    </div>
                  )}
                  {mobileActiveTab === 'studio' && (
                    <div className="flex-1 w-full overflow-hidden">
                      <StudioPanel
                        isOpen={true}
                        onClose={() => {}}
                        tools={STUDIO_TOOLS}
                        width={390}
                        isResizing={false}
                        sources={sources}
                        userId={user?.id}
                        noteId={activeNotebookId}
                        onPlayAudio={handlePlayAudio}
                        miniPlayerVisible={miniPlayerVisible}
                        miniPlayerData={miniPlayerData}
                        onCloseMiniPlayer={handleCloseMiniPlayer}
                        onExpandAudioPlayer={handleExpandAudioPlayer}
                      />
                    </div>
                  )}
                </div>
              </main>
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

// Wrapper component with BrowserRouter
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
