import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from './shared/ui/Header';
import { SourcesPanel } from './features/sources/components/SourcesPanel';
import { ChatPanel } from './features/chat/components/ChatPanel';
import { StudioPanel } from './features/studio/components/StudioPanel';
import { HomePage } from './features/notebooks/components/HomePage';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginModal } from './features/auth/components/LoginModal';
import { ThemeProvider } from './shared/contexts/ThemeContext';
import { STUDIO_TOOLS, SAVED_NOTES } from './shared/constants';
import { Source, Note, NotebookItem, Document, Message } from '@/shared/types/index';
import { documentsApi } from './features/sources/services/documentsApi';
import { notebooksApi } from './features/notebooks/services/notebooksApi';
import { notesApi } from './features/notebooks/services/notesApi';
import { mindMapApi } from './features/studio/services/mindMapApi';
import { flashcardsApi } from './features/studio/services/flashcardsApi';
import { quizzesApi } from './features/studio/services/quizzesApi';
import { chatApi } from './features/chat/services/chatApi';
import 'mind-elixir/style.css';

const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 600;

type ViewState = 'home' | 'notebook';

// Transform Document API type to Source UI type
function documentToSource(doc: Document): Source {
  return {
    id: doc.id,
    title: doc.title || doc.file_name,
    type: doc.file_type === 'youtube' ? 'WEB' : (doc.file_type === 'file' ? 'PDF' : 'WEB'),
    date: new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    selected: true,
    content: '',
    status: doc.status,
  };
}

const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading, signIn, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Notebook specific state
  const [isSourcesOpen, setIsSourcesOpen] = useState(true);
  const [isStudioOpen, setIsStudioOpen] = useState(true);
  const [sources, setSources] = useState<Source[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notebookTitle, setNotebookTitle] = useState("CPSC 304");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatStreaming, setIsChatStreaming] = useState(false);

  // Notebooks State
  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [notebooksLoading, setNotebooksLoading] = useState(false);
  const [notebooksError, setNotebooksError] = useState<string | null>(null);

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
          onError: (error: string) => {
            console.error('Chat error:', error);
            setIsChatStreaming(false);
            // Remove the temporary assistant message and add error indicator
            setMessages(prev => prev.filter(msg => msg.id !== tempAssistantId));
            alert(`Chat error: ${error}`);
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
        ])
          .then(([loadedNotes, loadedMindMaps, loadedFlashcards, loadedQuizzes]) => {
            const allNotes = [...loadedNotes, ...loadedMindMaps, ...loadedFlashcards, ...loadedQuizzes].sort((a, b) => {
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
    setNotes(prev => prev.map(n => n.id === id ? { ...note } : n));
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
      } else {
        await notesApi.deleteNote(id);
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      // Reload notes on error
      if (activeNotebookId) {
        notesApi.getNotes(activeNotebookId)
          .then(loadedNotes => setNotes(loadedNotes))
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

  // Load documents from API when authenticated and notebook is active
  useEffect(() => {
    if (isAuthenticated && user && activeNotebookId && activeNotebookId !== 'new' && currentView === 'notebook') {
      documentsApi.getDocuments(user.id, activeNotebookId)
        .then(docs => setSources(docs.map(documentToSource)))
        .catch(err => console.error('Failed to load documents:', err));
    }
  }, [isAuthenticated, user, activeNotebookId, currentView]);

  // Load notes, mind maps, flashcards, and quizzes from API when authenticated and notebook is active
  useEffect(() => {
    if (isAuthenticated && user && activeNotebookId && activeNotebookId !== 'new' && currentView === 'notebook') {
      // Fetch notes, mind maps, flashcards, and quizzes in parallel
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
      ])
        .then(([loadedNotes, loadedMindMaps, loadedFlashcards, loadedQuizzes]) => {
          // Merge notes, mind maps, flashcards, and quizzes, sort by created_at descending
          const allNotes = [...loadedNotes, ...loadedMindMaps, ...loadedFlashcards, ...loadedQuizzes].sort((a, b) => {
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

  // Show login modal if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShowLoginModal(true);
    } else if (isAuthenticated) {
      setShowLoginModal(false);
    }
  }, [isAuthenticated, isLoading]);

  // Navigation Handlers
  const handleLogoClick = () => {
    setCurrentView('home');
    setActiveNotebookId(null);
  };

  const handleSelectNotebook = (notebook: NotebookItem) => {
    setActiveNotebookId(notebook.id);
    setNotebookTitle(notebook.title);
    setCurrentView('notebook');
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
      setActiveNotebookId(newNotebook.id);
      setNotebookTitle(newNotebook.title);
      setCurrentView('notebook');
    } catch (error) {
      console.error('Failed to create notebook:', error);
      setNotebooksError(error instanceof Error ? error.message : 'Failed to create notebook');
    }
  };

  return (
    <>
      {/* Login Modal */}
      {showLoginModal && !isAuthenticated && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}

      <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden font-serif">
      <Header 
        title={notebookTitle} 
        onRename={(newTitle: string) => {
          setNotebookTitle(newTitle);
          // If we're in a notebook view, sync the rename with Supabase
          if (activeNotebookId && activeNotebookId !== 'new' && isAuthenticated) {
            handleUpdateNotebook(activeNotebookId, { title: newTitle });
          }
        }} 
        isHome={currentView === 'home'}
        onLogoClick={handleLogoClick}
      />
      
      {currentView === 'home' ? (
        <HomePage 
          featuredNotebooks={featuredNotebooks}
          recentNotebooks={recentNotebooks}
          onSelectNotebook={handleSelectNotebook}
          onCreateNotebook={handleCreateNotebook}
          onUpdateNotebook={handleUpdateNotebook}
          onDeleteNotebook={handleDeleteNotebook}
          isLoading={notebooksLoading}
          error={notebooksError}
        />
      ) : (
        <main className="flex-1 flex overflow-hidden relative animate-in fade-in duration-300">
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
              className="w-1 hover:w-1.5 -ml-0.5 z-50 cursor-col-resize flex-shrink-0 hover:bg-primary/50 transition-colors select-none"
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
              className="w-1 hover:w-1.5 -mr-0.5 z-50 cursor-col-resize flex-shrink-0 hover:bg-primary/50 transition-colors select-none"
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
          />
        </main>
      )}
    </div>
    </>
  );
};

// Wrapper component with AuthProvider
const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
