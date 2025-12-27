import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './shared/ui/Header';
import { SourcesPanel } from './features/sources/components/SourcesPanel';
import { ChatPanel } from './features/chat/components/ChatPanel';
import { StudioPanel } from './features/studio/components/StudioPanel';
import { HomePage } from './features/notebooks/components/HomePage';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginModal } from './features/auth/components/LoginModal';
import { MOCK_MESSAGES, STUDIO_TOOLS, SAVED_NOTES } from './shared/utils/constants';
import { Source, Note, NotebookItem, Document } from '@/shared/types/index';
import { documentsApi } from './features/sources/services/documentsApi';
import { notebooksApi } from './features/notebooks/services/notebooksApi';

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
    selected: false,
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
  const [notes, setNotes] = useState<Note[]>(SAVED_NOTES);
  const [notebookTitle, setNotebookTitle] = useState("CPSC 304");

  // Notebooks State
  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [notebooksLoading, setNotebooksLoading] = useState(false);
  const [notebooksError, setNotebooksError] = useState<string | null>(null);

  // Filter notebooks for home page
  const featuredNotebooks = notebooks.filter(nb => nb.isFeatured);
  const recentNotebooks = notebooks.filter(nb => !nb.isFeatured);

  // Resize State
  const [leftWidth, setLeftWidth] = useState(360);
  const [rightWidth, setRightWidth] = useState(320);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const toggleSources = () => setIsSourcesOpen(!isSourcesOpen);
  const toggleStudio = () => setIsStudioOpen(!isStudioOpen);

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
  
  const handleUpdateNote = (id: string, newTitle: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title: newTitle } : n));
  };

  const handleDeleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
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

  // Handle document upload - trigger a refresh
  const handleDocumentUploaded = useCallback(() => {
    if (user && activeNotebookId) {
      documentsApi.getDocuments(user.id, activeNotebookId)
        .then(docs => setSources(docs.map(documentToSource)))
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
            messages={MOCK_MESSAGES} 
            isLeftOpen={isSourcesOpen}
            isRightOpen={isStudioOpen}
            toggleLeft={toggleSources}
            toggleRight={toggleStudio}
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
            onDeleteNote={handleDeleteNote}
            onAddNote={handleAddNote}
            width={rightWidth}
            isResizing={isResizingRight}
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
