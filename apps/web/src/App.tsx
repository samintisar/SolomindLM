import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Header } from './shared/ui/Header';
import { SourcesPanel } from './features/sources/components/SourcesPanel';
import { ChatPanel } from './features/chat/components/ChatPanel';
import { StudioPanel } from './features/studio/components/StudioPanel';
import { HomePage } from './features/notebooks/components/HomePage';
import { BillingPage } from './features/billing/components/BillingPage';
import { LandingPage } from './features/landing/LandingPage';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginModal } from './features/auth/components/LoginModal';
import { AuthCallback } from './features/auth/components/AuthCallback';
import { ThemeProvider } from './shared/contexts/ThemeContext';
import { ProtectedRoute } from './shared/components/ProtectedRoute';
import { PrivacyPolicy } from './features/legal/components/PrivacyPolicy';
import { TermsOfService } from './features/legal/components/TermsOfService';
import { STUDIO_TOOLS } from './shared/constants';
import { Source, Note, NotebookItem, Document, Message, FolderItem } from '@/shared/types/index';
import { documentsApi } from './features/sources/services/documentsApi';
import { notebooksApi } from './features/notebooks/services/notebooksApi';
import { foldersApi } from './features/notebooks/services/foldersApi';
import { notesApi } from './features/notebooks/services/notesApi';
import { mindMapApi } from './features/studio/services/mindMapApi';
import { flashcardsApi } from './features/studio/services/flashcardsApi';
import { quizzesApi } from './features/studio/services/quizzesApi';
import { writtenQuestionsApi } from './features/studio/services/writtenQuestionsApi';
import { audioApi } from './features/audio/api/audioApi';
import { chatApi } from './features/chat/services/chatApi';
import { subscriptionApi } from './features/billing/services/subscriptionApi';
import 'mind-elixir/style.css';

const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 900;

// Transform Document API type to Source UI type
function documentToSource(doc: Document): Source {
  // Extract file extension and determine type
  let type: 'PDF' | 'TXT' | 'WEB' = 'PDF';
  
  if (doc.file_type === 'youtube') {
    type = 'WEB';
  } else if (doc.file_type === 'url') {
    type = 'WEB';
  } else if (doc.file_type === 'file') {
    // Extract extension from file_name
    const ext = doc.file_name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'txt' || ext === 'md' || ext === 'json' || ext === 'csv') {
      type = 'TXT';
    } else {
      type = 'PDF';
    }
  }
  
  return {
    id: doc.id,
    title: doc.title || doc.file_name,
    type,
    date: new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    selected: true,
    content: '',
    status: doc.status,
  };
}

const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Determine current view from URL
  const currentView = location.pathname === '/'
    ? 'landing'
    : location.pathname === '/home'
    ? 'home'
    : location.pathname === '/billing'
    ? 'billing'
    : location.pathname.startsWith('/notebook/')
    ? 'notebook'
    : 'landing';

  // Get notebook ID from URL pathname (e.g., /notebook/abc-123 -> abc-123)
  const urlNotebookId = location.pathname.startsWith('/notebook/')
    ? location.pathname.split('/notebook/')[1] || null
    : null;

  // Notebook specific state
  const [isSourcesOpen, setIsSourcesOpen] = useState(true);
  const [isStudioOpen, setIsStudioOpen] = useState(true);
  const [mobileActiveTab, setMobileActiveTab] = useState<'sources' | 'chat' | 'studio'>('sources');
  const [sources, setSources] = useState<Source[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notebookTitle, setNotebookTitle] = useState("Notebook");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatStreaming, setIsChatStreaming] = useState(false);

  // Mini Audio Player state
  const [miniPlayerVisible, setMiniPlayerVisible] = useState(false);
  const [miniPlayerData, setMiniPlayerData] = useState<{
    audioUrl: string;
    title: string;
    transcript?: string;
  } | null>(null);

  // Notebooks State
  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [notebooksLoading, setNotebooksLoading] = useState(false);
  const [notebooksError, setNotebooksError] = useState<string | null>(null);

  // Folders State
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [, setFoldersLoading] = useState(false);
  const [, setFoldersError] = useState<string | null>(null);

  // Subscription State
  const [hasSubscription, setHasSubscription] = useState(false);

  // Filter notebooks for home page
  const featuredNotebooks = notebooks.filter(nb => nb.isFeatured);
  const recentNotebooks = notebooks.filter(nb => !nb.isFeatured);

  // Resize State
  const [leftWidth, setLeftWidth] = useState(360);
  const [rightWidth, setRightWidth] = useState(420);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Ref to track the polling interval for document status updates
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync activeNotebookId with URL params
  useEffect(() => {
    if (urlNotebookId && urlNotebookId !== activeNotebookId) {
      setActiveNotebookId(urlNotebookId);
    }
    // Update notebook title when the notebook in the URL is found in the loaded notebooks
    if (urlNotebookId && notebooks.length > 0) {
      const notebook = notebooks.find(nb => nb.id === urlNotebookId);
      if (notebook) {
        setNotebookTitle(notebook.title);
      }
    } else if (!urlNotebookId && currentView !== 'notebook') {
      setActiveNotebookId(null);
    }
  }, [urlNotebookId, currentView, notebooks]);

  const toggleSources = () => setIsSourcesOpen(!isSourcesOpen);
  const toggleStudio = () => setIsStudioOpen(!isStudioOpen);

  const handleClearChatHistory = async () => {
    if (!activeNotebookId) return;

    try {
      await chatApi.clearHistory(activeNotebookId);
      setMessages([]);
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      alert(error instanceof Error ? error.message : 'Failed to clear chat history');
    }
  };

  // Load chat history when notebook changes
  useEffect(() => {
    if (isAuthenticated && user && activeNotebookId && activeNotebookId !== 'new' && currentView === 'notebook') {
      chatApi.getHistory(activeNotebookId)
        .then(data => {
          // Transform API messages to UI format
          const uiMessages = data.messages.map(msg => {
            const transformed = {
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: new Date(msg.created_at),
              references: msg.references,
            };
            // Log assistant messages with citations
            if (msg.role === 'assistant' && msg.content.match(/\[\d+\]/)) {
              console.log(`[App] Loaded assistant message ${msg.id} with citations:`, {
                hasReferences: !!msg.references,
                referencesCount: Array.isArray(msg.references) ? msg.references.length : 0,
                references: msg.references
              });
            }
            return transformed;
          });
          setMessages(uiMessages);
        })
        .catch(err => {
          console.error('Failed to load chat history:', err);
          // Set empty messages on error (not critical, user can start fresh)
          setMessages([]);
        });
    } else if (currentView === 'home') {
      // Clear messages when going to home
      setMessages([]);
    }
  }, [isAuthenticated, user, activeNotebookId, currentView]);

  // Handle sending a chat message
  const handleSendMessage = async (messageText: string) => {
    if (!activeNotebookId || isChatStreaming) return;

    // Add user message immediately
    const userMessage = {
      id: `temp-${Date.now()}`,
      role: 'user' as const,
      content: messageText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Create a placeholder assistant message for streaming
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    const assistantMessage = {
      id: tempAssistantId,
      role: 'assistant' as const,
      content: '',
      timestamp: new Date(),
      references: undefined,
    };
    setMessages(prev => [...prev, assistantMessage]);

    setIsChatStreaming(true);

    // Get selected document IDs
    const selectedDocumentIds = sources
      .filter(source => source.selected)
      .map(source => source.id);

    try {
      await chatApi.sendMessage(
        activeNotebookId,
        messageText,
        {
          onToken: (token: string) => {
            setMessages(prev => prev.map(msg =>
              msg.id === tempAssistantId
                ? { ...msg, content: msg.content + token }
                : msg
            ));
          },
          onReferences: (references: any[]) => {
            console.log('[App] Received references:', references);
            setMessages(prev => prev.map(msg =>
              msg.id === tempAssistantId
                ? { ...msg, references }
                : msg
            ));
          },
          onComplete: () => {
            setIsChatStreaming(false);
            // Reload chat history to get the persisted message with proper ID
            chatApi.getHistory(activeNotebookId)
              .then(data => {
                const uiMessages = data.messages.map(msg => ({
                  id: msg.id,
                  role: msg.role as 'user' | 'assistant',
                  content: msg.content,
                  timestamp: new Date(msg.created_at),
                  references: msg.references,
                }));
                setMessages(uiMessages);
              })
              .catch(err => console.error('Failed to reload chat history:', err));
          },
          onError: (error: string | { message: string; type?: string }) => {
            console.error('Chat error:', error);
            setIsChatStreaming(false);

            // Handle no_documents error with a helpful AI message
            const errorMessage = typeof error === 'string' ? error : error.message;
            const errorType = typeof error === 'string' ? undefined : error.type;

            if (errorType === 'no_documents') {
              // Replace the temporary assistant message with a helpful response
              const helpfulMessage = "I couldn't find any relevant information in your selected documents to answer this question. This could happen if:\n\n• The documents don't contain information related to your question\n• The search terms don't match the language used in the documents\n• The documents are still being processed\n\nTry rephrasing your question, selecting different documents, or adding more relevant sources to your notebook.";
              setMessages(prev => prev.map(msg =>
                msg.id === tempAssistantId
                  ? { ...msg, content: helpfulMessage }
                  : msg
              ));
            } else {
              // For other errors, remove the temporary message and show alert
              setMessages(prev => prev.filter(msg => msg.id !== tempAssistantId));
              alert(`Chat error: ${errorMessage}`);
            }
          },
        },
        selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsChatStreaming(false);
      setMessages(prev => prev.filter(msg => msg.id !== tempAssistantId));
      alert(error instanceof Error ? error.message : 'Failed to send message');
    }
  };

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
    try {
      // Find the note to check its type
      const noteToUpdate = notes.find(n => n.id === id);

      // Optimistically update UI
      setNotes(prev => prev.map(n => n.id === id ? { ...n, title: newTitle } : n));

      // Sync with backend - route to correct API based on type
      if (noteToUpdate?.type === 'mindmap') {
        await mindMapApi.renameMindMap(id, newTitle);
      } else if (noteToUpdate?.type === 'flashcard') {
        await flashcardsApi.renameFlashcard(id, newTitle);
      } else if (noteToUpdate?.type === 'quiz') {
        await quizzesApi.renameQuiz(id, newTitle);
      } else if (noteToUpdate?.type === 'writtenQuestions') {
        await writtenQuestionsApi.renameWrittenQuestions(id, newTitle);
      } else if (noteToUpdate?.type === 'audio') {
        await audioApi.renameAudioOverview(id, newTitle);
      } else {
        await notesApi.renameNote(id, newTitle);
      }
    } catch (error) {
      console.error('Failed to rename note:', error);
      // Reload notes on error
      if (activeNotebookId) {
        Promise.all([
          notesApi.getNotes(activeNotebookId).catch(err => {
            console.error('Failed to load notes:', err);
            return [];
          }),
          mindMapApi.getMindMaps(activeNotebookId).catch(err => {
            console.error('Failed to load mind maps:', err);
            return [];
          }),
          flashcardsApi.getFlashcards(activeNotebookId).catch(err => {
            console.error('Failed to load flashcards:', err);
            return [];
          }),
          quizzesApi.getQuizzes(activeNotebookId).catch(err => {
            console.error('Failed to load quizzes:', err);
            return [];
          }),
          writtenQuestionsApi.getWrittenQuestionsByNotebook(activeNotebookId).catch(err => {
            console.error('Failed to load written questions:', err);
            return [];
          }),
          audioApi.getAudioOverviewsByNotebook(activeNotebookId).catch(err => {
            console.error('Failed to load audio overviews:', err);
            return [];
          }),
        ])
          .then(([loadedNotes, loadedMindMaps, loadedFlashcards, loadedQuizzes, loadedWrittenQuestions, loadedAudio]) => {
            const allNotes = [...loadedNotes, ...loadedMindMaps, ...loadedFlashcards, ...loadedQuizzes, ...loadedWrittenQuestions, ...loadedAudio].sort((a, b) => {
              const aDate = a.metadata?.generatedAt || a.metadata?.createdAt || '';
              const bDate = b.metadata?.generatedAt || b.metadata?.createdAt || '';
              return bDate.localeCompare(aDate);
            });
            setNotes(allNotes);
          })
          .catch(err => console.error('Failed to reload notes:', err));
      }
    }
  };

  const handleUpdateNoteFull = (id: string, note: Note) => {
    setNotes(prev => {
      return prev.map(n => n.id === id ? { ...note } : n);
    });
  };

  const handleDeleteNote = async (id: string) => {
    try {
      // Find the note to check its type
      const noteToDelete = notes.find(n => n.id === id);

      // Optimistically remove from UI
      setNotes(prev => prev.filter(n => n.id !== id));

      // Delete from backend - route to correct API based on type
      if (noteToDelete?.type === 'mindmap') {
        await mindMapApi.deleteMindMap(id);
      } else if (noteToDelete?.type === 'flashcard') {
        await flashcardsApi.deleteFlashcard(id);
      } else if (noteToDelete?.type === 'quiz') {
        await quizzesApi.deleteQuiz(id);
      } else if (noteToDelete?.type === 'writtenQuestions') {
        await writtenQuestionsApi.deleteWrittenQuestions(id);
      } else if (noteToDelete?.type === 'audio') {
        await audioApi.deleteAudioOverview(id);
      } else {
        await notesApi.deleteNote(id);
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      // Reload notes on error
      if (activeNotebookId) {
        Promise.all([
          notesApi.getNotes(activeNotebookId).catch(err => {
            console.error('Failed to load notes:', err);
            return [];
          }),
          mindMapApi.getMindMaps(activeNotebookId).catch(err => {
            console.error('Failed to load mind maps:', err);
            return [];
          }),
          flashcardsApi.getFlashcards(activeNotebookId).catch(err => {
            console.error('Failed to load flashcards:', err);
            return [];
          }),
          quizzesApi.getQuizzes(activeNotebookId).catch(err => {
            console.error('Failed to load quizzes:', err);
            return [];
          }),
          writtenQuestionsApi.getWrittenQuestionsByNotebook(activeNotebookId).catch(err => {
            console.error('Failed to load written questions:', err);
            return [];
          }),
          audioApi.getAudioOverviewsByNotebook(activeNotebookId).catch(err => {
            console.error('Failed to load audio overviews:', err);
            return [];
          }),
        ])
          .then(([loadedNotes, loadedMindMaps, loadedFlashcards, loadedQuizzes, loadedWrittenQuestions, loadedAudio]) => {
            const allNotes = [...loadedNotes, ...loadedMindMaps, ...loadedFlashcards, ...loadedQuizzes, ...loadedWrittenQuestions, ...loadedAudio].sort((a, b) => {
              const aDate = a.metadata?.generatedAt || a.metadata?.createdAt || '';
              const bDate = b.metadata?.generatedAt || b.metadata?.createdAt || '';
              return bDate.localeCompare(aDate);
            });
            setNotes(allNotes);
          })
          .catch(err => console.error('Failed to reload notes:', err));
      }
    }
  };

  const handleAddNote = (note: Note) => {
    setNotes(prev => [note, ...prev]);
  };

  const handleUpdateNotebook = async (id: string, updates: Partial<NotebookItem>) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot update notebook: not authenticated');
      return;
    }

    try {
      // Optimistically update UI
      setNotebooks(prev => prev.map(nb => nb.id === id ? { ...nb, ...updates } : nb));
      if (activeNotebookId === id && updates.title) {
        setNotebookTitle(updates.title);
      }

      // Sync with Supabase
      const updatePayload: any = {};
      if (updates.title !== undefined) updatePayload.title = updates.title;
      if (updates.coverColor !== undefined) updatePayload.coverColor = updates.coverColor;
      if (updates.icon !== undefined) updatePayload.icon = updates.icon;
      if (updates.isFeatured !== undefined) updatePayload.isFeatured = updates.isFeatured;

      const updatedNotebook = await notebooksApi.updateNotebook(id, updatePayload);
      
      // Update with server response to ensure consistency
      setNotebooks(prev => prev.map(nb => nb.id === id ? updatedNotebook : nb));
      
      if (activeNotebookId === id) {
        setNotebookTitle(updatedNotebook.title);
      }
    } catch (error) {
      console.error('Failed to update notebook:', error);
      // Revert optimistic update on error
      loadNotebooks();
      setNotebooksError(error instanceof Error ? error.message : 'Failed to update notebook');
    }
  };

  const handleDeleteNotebook = async (id: string) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot delete notebook: not authenticated');
      return;
    }

    try {
      // Optimistically remove from UI
      setNotebooks(prev => prev.filter(nb => nb.id !== id));
      if (activeNotebookId === id) {
        handleLogoClick();
      }

      // Sync with Supabase
      await notebooksApi.deleteNotebook(id);
    } catch (error) {
      console.error('Failed to delete notebook:', error);
      // Revert optimistic update on error
      loadNotebooks();
      setNotebooksError(error instanceof Error ? error.message : 'Failed to delete notebook');
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
      if (isResizingLeft) {
        const newWidth = mouseMoveEvent.clientX;
        if (newWidth >= MIN_PANEL_WIDTH && newWidth <= MAX_PANEL_WIDTH) {
          setLeftWidth(newWidth);
        }
      }
      if (isResizingRight) {
        const newWidth = window.innerWidth - mouseMoveEvent.clientX;
        if (newWidth >= MIN_PANEL_WIDTH && newWidth <= MAX_PANEL_WIDTH) {
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

  // Load notebooks from API when authenticated
  const loadNotebooks = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setNotebooks([]);
      return;
    }

    setNotebooksLoading(true);
    setNotebooksError(null);
    try {
      const fetchedNotebooks = await notebooksApi.getNotebooks();
      setNotebooks(fetchedNotebooks);
    } catch (error) {
      console.error('Failed to load notebooks:', error);
      setNotebooksError(error instanceof Error ? error.message : 'Failed to load notebooks');
      setNotebooks([]);
    } finally {
      setNotebooksLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    loadNotebooks();
  }, [loadNotebooks]);

  // Load folders from API when authenticated
  const loadFolders = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setFolders([]);
      return;
    }

    setFoldersLoading(true);
    setFoldersError(null);
    try {
      const fetchedFolders = await foldersApi.getFolders();
      setFolders(fetchedFolders);
    } catch (error) {
      console.error('Failed to load folders:', error);
      setFoldersError(error instanceof Error ? error.message : 'Failed to load folders');
      setFolders([]);
    } finally {
      setFoldersLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Load subscription status when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      subscriptionApi.getStatus()
        .then(status => setHasSubscription(status.hasSubscription))
        .catch(err => console.error('Failed to load subscription status:', err));
    } else {
      setHasSubscription(false);
    }
  }, [isAuthenticated, user]);

  // Handle redirect from Stripe checkout
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');

    if ((success === 'true' || canceled === 'true') && isAuthenticated && user) {
      // Refresh subscription status after returning from Stripe
      subscriptionApi.getStatus()
        .then(status => setHasSubscription(status.hasSubscription))
        .catch(err => console.error('Failed to load subscription status:', err))
        .finally(() => {
          // Navigate to billing page after refreshing status
          navigate('/billing');
          // Clean up URL
          window.history.replaceState({}, '', window.location.pathname);
        });
    }
  }, [isAuthenticated, user, navigate]);

  // Load documents from API when authenticated and notebook is active
  useEffect(() => {
    if (isAuthenticated && user && activeNotebookId && activeNotebookId !== 'new' && currentView === 'notebook') {
      documentsApi.getDocuments(user.id, activeNotebookId)
        .then(docs => setSources(docs.map(documentToSource)))
        .catch(err => console.error('Failed to load documents:', err));
    }
  }, [isAuthenticated, user, activeNotebookId, currentView]);

  // Load notes, mind maps, flashcards, quizzes, written questions, and audio overviews from API when authenticated and notebook is active
  useEffect(() => {
    if (isAuthenticated && user && activeNotebookId && activeNotebookId !== 'new' && currentView === 'notebook') {
      // Fetch all content types in parallel
      Promise.all([
        notesApi.getNotes(activeNotebookId).catch(err => {
          console.error('Failed to load notes:', err);
          return [];
        }),
        mindMapApi.getMindMaps(activeNotebookId).catch(err => {
          console.error('Failed to load mind maps:', err);
          return [];
        }),
        flashcardsApi.getFlashcards(activeNotebookId).catch(err => {
          console.error('Failed to load flashcards:', err);
          return [];
        }),
        quizzesApi.getQuizzes(activeNotebookId).catch(err => {
          console.error('Failed to load quizzes:', err);
          return [];
        }),
        writtenQuestionsApi.getWrittenQuestionsByNotebook(activeNotebookId).catch(err => {
          console.error('Failed to load written questions:', err);
          return [];
        }),
        audioApi.getAudioOverviewsByNotebook(activeNotebookId).catch(err => {
          console.error('Failed to load audio overviews:', err);
          return [];
        }),
      ])
        .then(([loadedNotes, loadedMindMaps, loadedFlashcards, loadedQuizzes, loadedWrittenQuestions, loadedAudio]) => {
          // Merge all content types, sort by created_at descending
          const allNotes = [...loadedNotes, ...loadedMindMaps, ...loadedFlashcards, ...loadedQuizzes, ...loadedWrittenQuestions, ...loadedAudio].sort((a, b) => {
            const aDate = a.metadata?.generatedAt || a.metadata?.createdAt || '';
            const bDate = b.metadata?.generatedAt || b.metadata?.createdAt || '';
            return bDate.localeCompare(aDate);
          });
          setNotes(allNotes);
        })
        .catch(err => console.error('Failed to load notes:', err));
    } else if (currentView === 'home') {
      // Clear notes when going to home
      setNotes([]);
    }
  }, [isAuthenticated, user, activeNotebookId, currentView]);

  // Cleanup polling interval on unmount or when switching notebooks
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [activeNotebookId]);

  // Handle document upload - trigger a refresh and start polling if needed
  const handleDocumentUploaded = useCallback(() => {
    if (user && activeNotebookId) {
      documentsApi.getDocuments(user.id, activeNotebookId)
        .then(docs => {
          const mappedSources = docs.map(documentToSource);
          setSources(mappedSources);

          // Check if any documents are still processing and start polling
          const hasProcessing = docs.some(doc => doc.status === 'pending' || doc.status === 'processing');
          if (hasProcessing) {
            // Clear any existing polling interval
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }

            // Poll every 2 seconds until all documents are completed/failed
            pollingIntervalRef.current = setInterval(async () => {
              try {
                const updatedDocs = await documentsApi.getDocuments(user.id, activeNotebookId);
                const allDone = updatedDocs.every(doc => doc.status === 'completed' || doc.status === 'failed');

                setSources(updatedDocs.map(documentToSource));

                if (allDone) {
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                  }
                }
              } catch (err) {
                console.error('Failed to poll document status:', err);
                if (pollingIntervalRef.current) {
                  clearInterval(pollingIntervalRef.current);
                  pollingIntervalRef.current = null;
                }
              }
            }, 2000);
          }
        })
        .catch(err => console.error('Failed to load documents:', err));
    }
  }, [user, activeNotebookId]);

  // Handle source deletion
  const handleDeleteSource = useCallback(async (sourceId: string) => {
    try {
      // Optimistically remove from UI
      setSources(prev => prev.filter(s => s.id !== sourceId));
      
      // Delete from backend (which will also delete from storage and database)
      await documentsApi.deleteDocument(sourceId);
    } catch (error) {
      console.error('Failed to delete source:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete source');
      // Reload sources on error
      if (user && activeNotebookId) {
        documentsApi.getDocuments(user.id, activeNotebookId)
          .then(docs => setSources(docs.map(documentToSource)))
          .catch(err => console.error('Failed to load documents:', err));
      }
    }
  }, [user, activeNotebookId]);

  // Handle source rename
  const handleRenameSource = useCallback(async (sourceId: string, newTitle: string) => {
    try {
      // Optimistically update UI
      setSources(prev => prev.map(s => s.id === sourceId ? { ...s, title: newTitle } : s));
      
      // Sync with backend
      await documentsApi.renameDocument(sourceId, newTitle);
    } catch (error) {
      console.error('Failed to rename source:', error);
      alert(error instanceof Error ? error.message : 'Failed to rename source');
      // Reload sources on error
      if (user && activeNotebookId) {
        documentsApi.getDocuments(user.id, activeNotebookId)
          .then(docs => setSources(docs.map(documentToSource)))
          .catch(err => console.error('Failed to load documents:', err));
      }
    }
  }, [user, activeNotebookId]);

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
    // Refresh subscription status when returning from billing page
    if (isAuthenticated && user) {
      subscriptionApi.getStatus()
        .then(status => setHasSubscription(status.hasSubscription))
        .catch(err => console.error('Failed to load subscription status:', err));
    }
    navigate('/home');
  };

  const handleSelectNotebook = (notebook: NotebookItem) => {
    navigate(`/notebook/${notebook.id}`);
  };

  const handleCreateNotebook = async () => {
    if (!isAuthenticated || !user) {
      console.error('Cannot create notebook: not authenticated');
      return;
    }

    try {
      const newNotebook = await notebooksApi.createNotebook({
        title: 'Untitled Notebook',
        coverColor: 'bg-yellow-500',
        icon: 'Folder',
      });

      setNotebooks(prev => [newNotebook, ...prev]);
      navigate(`/notebook/${newNotebook.id}`);
    } catch (error) {
      console.error('Failed to create notebook:', error);
      setNotebooksError(error instanceof Error ? error.message : 'Failed to create notebook');
    }
  };

  const handleCreateFolder = async () => {
    if (!isAuthenticated || !user) {
      console.error('Cannot create folder: not authenticated');
      return;
    }

    try {
      const newFolder = await foldersApi.createFolder({
        name: 'New Folder',
        color: 'bg-blue-500',
        icon: 'Folder',
      });

      setFolders(prev => [newFolder, ...prev]);
    } catch (error) {
      console.error('Failed to create folder:', error);
      setFoldersError(error instanceof Error ? error.message : 'Failed to create folder');
    }
  };

  const handleUpdateFolder = async (id: string, updates: Partial<FolderItem>) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot update folder: not authenticated');
      return;
    }

    try {
      // Optimistically update UI
      setFolders(prev => prev.map(f => f.id === id ? ({ ...f, ...updates }) : f));

      // Sync with backend
      const updatedFolder = await foldersApi.updateFolder(id, {
        name: updates.name,
        description: updates.description,
        color: updates.color,
        icon: updates.icon,
      });

      // Update with server response
      setFolders(prev => prev.map(f => f.id === id ? updatedFolder : f));
    } catch (error) {
      console.error('Failed to update folder:', error);
      loadFolders();
      setFoldersError(error instanceof Error ? error.message : 'Failed to update folder');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot delete folder: not authenticated');
      return;
    }

    try {
      // Optimistically remove from UI
      setFolders(prev => prev.filter(f => f.id !== id));

      // Sync with backend (this will also set notebooks' folder_id to null)
      await foldersApi.deleteFolder(id);

      // Reload notebooks to get updated folder_id values
      loadNotebooks();
    } catch (error) {
      console.error('Failed to delete folder:', error);
      loadFolders();
      setFoldersError(error instanceof Error ? error.message : 'Failed to delete folder');
    }
  };

  const handleMoveNotebookToFolder = async (notebookId: string, folderId: string | null) => {
    if (!isAuthenticated || !user) {
      console.error('Cannot move notebook: not authenticated');
      return;
    }

    try {
      // Optimistically update UI - remove from notebooks list (it will be in folder now)
      setNotebooks(prev => prev.map(nb => {
        if (nb.id === notebookId) {
          return { ...nb, folderId: folderId || undefined };
        }
        return nb;
      }));

      // Sync with backend
      const updatedNotebook = await notebooksApi.updateNotebook(notebookId, { folderId });

      // Update with server response
      setNotebooks(prev => prev.map(nb => nb.id === notebookId ? updatedNotebook : nb));

      // Reload folders to update notebook counts
      loadFolders();
    } catch (error) {
      console.error('Failed to move notebook:', error);
      loadNotebooks();
      loadFolders();
      setNotebooksError(error instanceof Error ? error.message : 'Failed to move notebook');
    }
  };

  const handlePlayAudio = (audioUrl: string, title: string, transcript?: string, noteId?: string) => {
    setMiniPlayerData({ audioUrl, title, transcript });
    setMiniPlayerVisible(true);
    // Store the current playing audio note ID for expand functionality
    if (noteId) {
      (window as any).__currentPlayingAudioNoteId = noteId;
    }
  };

  const handleCloseMiniPlayer = () => {
    setMiniPlayerVisible(false);
  };

  const handleExpandAudioPlayer = () => {
    // Close mini player and open the full player in studio panel
    setMiniPlayerVisible(false);
    const noteId = (window as any).__currentPlayingAudioNoteId;
    if (noteId) {
      const note = notes.find(n => n.id === noteId);
      if (note) {
        // Trigger the note click by setting it as active
        const event = new CustomEvent('setActiveNote', { detail: { noteId } });
        window.dispatchEvent(event);
      }
    }
  };

  return (
    <>
      {/* Login Modal */}
      {showLoginModal && !isAuthenticated && (
        <LoginModal
          onClose={() => {
            setShowLoginModal(false);
            setAuthError(null);
          }}
          authError={authError || undefined}
        />
      )}

      <div className={`w-full bg-background text-foreground font-serif ${location.pathname === '/' || location.pathname === '/privacy' || location.pathname === '/terms' ? '' : 'flex flex-col h-screen overflow-hidden'}`}>
      {location.pathname !== '/' && location.pathname !== '/privacy' && location.pathname !== '/terms' && (
        <Header
          title={notebookTitle}
          onRename={(newTitle: string) => {
            setNotebookTitle(newTitle);
            // If we're in a notebook view, sync the rename with Supabase
            if (activeNotebookId && activeNotebookId !== 'new' && isAuthenticated) {
              handleUpdateNotebook(activeNotebookId, { title: newTitle });
            }
          }}
          isHome={location.pathname === '/home' || location.pathname === '/billing'}
          onLogoClick={handleLogoClick}
          onBillingClick={handleBillingClick}
          hasSubscription={hasSubscription}
        />
      )}

      <Routes>
        <Route path="/" element={<LandingPage onGetStarted={handleGetStarted} />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />

        <Route
          path="/home"
          element={
            <HomePage
              featuredNotebooks={featuredNotebooks}
              recentNotebooks={recentNotebooks}
              onSelectNotebook={handleSelectNotebook}
              onCreateNotebook={handleCreateNotebook}
              onUpdateNotebook={handleUpdateNotebook}
              onDeleteNotebook={handleDeleteNotebook}
              isLoading={notebooksLoading}
              error={notebooksError}
              folders={folders}
              onCreateFolder={handleCreateFolder}
              onUpdateFolder={handleUpdateFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveNotebookToFolder={handleMoveNotebookToFolder}
              loadFolders={loadFolders}
              onRequireAuth={(errorMessage) => {
                setAuthError(errorMessage);
                setShowLoginModal(true);
              }}
            />
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
              <main className="flex-1 flex flex-col overflow-hidden relative animate-in fade-in duration-300">
                {/* Mobile Navigation Bar */}
                <div className="md:hidden flex items-center justify-around border-b border-border bg-background sticky top-0 z-[60] h-12">
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
                    sources={sources}
                    onToggleSource={handleToggleSource}
                    onToggleAll={handleToggleAll}
                    onAddSource={handleAddSource}
                    onDeleteSource={handleDeleteSource}
                    onRenameSource={handleRenameSource}
                    width={leftWidth}
                    isResizing={isResizingLeft}
                    userId={user?.id}
                    noteId={activeNotebookId}
                    onDocumentUploaded={handleDocumentUploaded}
                  />

                  {/* Left Drag Handle */}
                  {isSourcesOpen && (
                    <div
                      className="w-1 hover:w-1.5 -ml-0.5 z-50 cursor-col-resize shrink-0 hover:bg-primary/50 transition-colors select-none"
                      onMouseDown={startResizingLeft}
                    />
                  )}

                  <ChatPanel
                    messages={messages}
                    isLeftOpen={isSourcesOpen}
                    isRightOpen={isStudioOpen}
                    toggleLeft={toggleSources}
                    toggleRight={toggleStudio}
                    onClearHistory={handleClearChatHistory}
                    onSendMessage={handleSendMessage}
                    isLoading={isChatStreaming}
                    notebookId={activeNotebookId}
                  />

                  {/* Right Drag Handle */}
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
                    notes={notes}
                    onUpdateNote={handleUpdateNote}
                    onUpdateNoteFull={handleUpdateNoteFull}
                    onDeleteNote={handleDeleteNote}
                    onAddNote={handleAddNote}
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
                        sources={sources}
                        onToggleSource={handleToggleSource}
                        onToggleAll={handleToggleAll}
                        onAddSource={handleAddSource}
                        onDeleteSource={handleDeleteSource}
                        onRenameSource={handleRenameSource}
                        width={390}
                        isResizing={false}
                        userId={user?.id}
                        noteId={activeNotebookId}
                        onDocumentUploaded={handleDocumentUploaded}
                      />
                    </div>
                  )}
                  {mobileActiveTab === 'chat' && (
                    <div className="flex-1 w-full overflow-hidden">
                      <ChatPanel
                        messages={messages}
                        isLeftOpen={false}
                        isRightOpen={false}
                        toggleLeft={() => {}}
                        toggleRight={() => {}}
                        onClearHistory={handleClearChatHistory}
                        onSendMessage={handleSendMessage}
                        isLoading={isChatStreaming}
                        notebookId={activeNotebookId}
                      />
                    </div>
                  )}
                  {mobileActiveTab === 'studio' && (
                    <div className="flex-1 w-full overflow-hidden">
                      <StudioPanel
                        isOpen={true}
                        onClose={() => {}}
                        tools={STUDIO_TOOLS}
                        notes={notes}
                        onUpdateNote={handleUpdateNote}
                        onUpdateNoteFull={handleUpdateNoteFull}
                        onDeleteNote={handleDeleteNote}
                        onAddNote={handleAddNote}
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
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
    </>
  );
};

// Wrapper component with AuthProvider and BrowserRouter
const App: React.FC = () => {
  return (
    <>
      <Analytics />
      <SpeedInsights />
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </>
  );
};

export default App;
