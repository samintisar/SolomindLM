
import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronRight,
  MoreVertical,
  AudioLines,
  GitFork,
  FileText,
  Layers,
  HelpCircle,
  Pencil,
  PenTool,
  Trash2,
  Play,
  ArrowLeft,
  X,
  Loader2,
  MessageSquareText,
} from 'lucide-react';
import { StudioTool, Note, isReportNote, isFlashcardNote, isQuizNote, isMindMapNote, isAudioNote, isWrittenQuestionsNote } from '@/shared/types/index';
import { ConfirmDialog, useConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { CreateReportModal } from './CreateReportModal';
import { CustomizeFlashcardsModal } from './CustomizeFlashcardsModal';
import { CustomizeQuizModal } from './CustomizeQuizModal';
import { CustomizeAudioModal } from './CustomizeAudioModal';
import { CustomizeWrittenQuestionsModal } from './CustomizeWrittenQuestionsModal';
import { ReportView } from './views/ReportView';
import { FlashcardView } from './views/FlashcardView';
import { QuizView } from './views/QuizView';
import { MindMapView } from './views/MindMapView';
import { WrittenQuestionsView } from './views/WrittenQuestionsView';
import { AudioPlayer } from '@/features/audio/components/AudioPlayer';
import { MiniAudioPlayer } from '@/features/audio/components/MiniAudioPlayer';
import { useStudioHandlers } from '../hooks/useStudioHandlers';
import './MindMapStyles.css';

interface StudioPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tools: StudioTool[];
  notes: Note[];
  onUpdateNote: (id: string, newTitle: string) => void;
  onUpdateNoteFull?: (id: string, note: Note) => void;
  onDeleteNote: (id: string) => void;
  onAddNote: (note: Note) => void;
  width: number;
  isResizing: boolean;
  sources?: any[];
  userId?: string | null;
  noteId?: string | null;
  onPlayAudio?: (audioUrl: string, title: string, transcript?: string, noteId?: string) => void;
  miniPlayerVisible?: boolean;
  miniPlayerData?: {
    audioUrl: string;
    title: string;
    transcript?: string;
  } | null;
  onCloseMiniPlayer?: () => void;
  onExpandAudioPlayer?: () => void;
}

const IconMap: Record<string, React.FC<any>> = {
  AudioLines,
  GitFork,
  FileText,
  Layers,
  HelpCircle,
  MessageSquareText,
};

export const StudioPanel: React.FC<StudioPanelProps> = ({
  isOpen,
  onClose,
  tools,
  notes,
  onUpdateNote,
  onUpdateNoteFull,
  onDeleteNote,
  onAddNote,
  width,
  isResizing,
  sources = [],
  userId,
  noteId,
  onPlayAudio,
  miniPlayerVisible = false,
  miniPlayerData = null,
  onCloseMiniPlayer,
  onExpandAudioPlayer,
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isMindMapExpanded, setIsMindMapExpanded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const activeNote = notes.find(n => n.id === activeNoteId);
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  // Use custom hook for business logic handlers
  const {
    isReportModalOpen,
    isFlashcardModalOpen,
    isQuizModalOpen,
    isAudioModalOpen,
    isWrittenQuestionsModalOpen,
    setIsReportModalOpen,
    setIsFlashcardModalOpen,
    setIsQuizModalOpen,
    setIsAudioModalOpen,
    setIsWrittenQuestionsModalOpen,
    handleToolClick,
    handleCreateReport,
    handleCreateFlashcards,
    handleCreateQuiz,
    handleCreateAudio,
    handleCreateWrittenQuestions,
  } = useStudioHandlers({
    notes,
    sources,
    userId,
    noteId,
    onAddNote,
    onUpdateNote,
    onUpdateNoteFull,
    onDeleteNote,
    onSetActiveNoteId: setActiveNoteId,
    confirm,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeMenuId && !(event.target as Element).closest('.kebab-menu')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuId]);

  useEffect(() => {
    const handleSetActiveNote = (event: Event) => {
      const customEvent = event as CustomEvent;
      const noteId = customEvent.detail?.noteId;
      if (noteId) {
        const note = notes.find(n => n.id === noteId);
        if (note) {
          setActiveNoteId(noteId);
        }
      }
    };
    window.addEventListener('setActiveNote', handleSetActiveNote);
    return () => window.removeEventListener('setActiveNote', handleSetActiveNote);
  }, [notes]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  const handleStartEdit = (note: Note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setActiveMenuId(null);
  };

  const handleSaveEdit = () => {
    if (editingId && editTitle.trim()) {
      onUpdateNote(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveEdit();
    if (e.key === 'Escape') setEditingId(null);
  };

  const handleDeleteNoteWithConfirmation = async (note: Note) => {
    const confirmed = await confirm(
      'Delete Note',
      `Are you sure you want to delete "${note.title}"? This action cannot be undone.`,
      { confirmText: 'Delete', cancelText: 'Cancel', variant: 'danger' }
    );
    if (confirmed) {
      onDeleteNote(note.id);
    }
  };

  const handleNoteClick = (note: Note) => {
    // Prevent clicking on generating notes
    if (note.status === 'generating') {
      return;
    }
    if (note.type === 'quiz' || note.type === 'flashcard' || note.type === 'report' || note.type === 'mindmap' || note.type === 'audio' || note.type === 'writtenQuestions') {
        setActiveNoteId(note.id);
    }
  };

  return (
    <><div
      style={{ width: isOpen ? width : 0 }}
      className={`
        relative shrink-0 bg-sidebar border-l-2 border-border h-full flex flex-col
        overflow-hidden
        ${isOpen ? 'opacity-100' : 'opacity-0'}
      `}
    >
      {/* Resize Handle */}
      {isOpen && (
        <div
          className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-primary/50 z-50 transition-colors active:bg-primary/70 group"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const startX = e.clientX;
            const startWidth = width;
            let animationFrameId: number | null = null;
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
              }
              
              animationFrameId = requestAnimationFrame(() => {
                // When dragging left, positive movement expands, negative contracts
                const delta = -(moveEvent.clientX - startX);
                const newWidth = Math.max(220, Math.min(900, startWidth + delta));
                // Dispatch custom event that parent can listen to
                window.dispatchEvent(new CustomEvent('resizeStudioPanel', { detail: { width: newWidth } }));
              });
            };
            
            const handleMouseUp = () => {
              if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
              }
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              document.body.style.userSelect = '';
              document.body.style.cursor = '';
            };
            
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        />
      )}
      
      <div className="flex items-center justify-between p-4 border-b border-border bg-sidebar/50 backdrop-blur-sm sticky top-0 z-10 h-14">
        {activeNote ? (
            <div className="flex items-center gap-2 text-sidebar-foreground w-full">
                <button
                  onClick={() => setActiveNoteId(null)}
                  className="p-1 -ml-1 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground flex items-center justify-center shrink-0"
                >
                  <ArrowLeft className="w-5 h-5 shrink-0" />
                </button>
                <div className="flex flex-col overflow-hidden">
                    <span className="font-sans font-bold text-sm tracking-wide truncate">{activeNote.title}</span>
                </div>
            </div>
        ) : (
            <>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground flex items-center justify-center shrink-0"
                >
                  <ChevronRight className="w-5 h-5 shrink-0" />
                </button>
                <div className="flex items-center gap-2 text-sidebar-foreground">
                  <PenTool className="w-4 h-4 shrink-0" />
                  <span className="font-sans font-bold text-sm tracking-wide uppercase">Studio</span>
                </div>
            </>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto w-full relative ${miniPlayerVisible ? 'overflow-hidden' : ''}`}>
        {activeNote ? (
            <div className="h-full p-4">
                {isReportNote(activeNote) && <ReportView note={activeNote} />}
                {isFlashcardNote(activeNote) && <FlashcardView note={activeNote} />}
                {isQuizNote(activeNote) && <QuizView note={activeNote} onNoteUpdate={(updatedNote) => onUpdateNoteFull?.(activeNote.id, updatedNote)} />}
                {isMindMapNote(activeNote) && (
                  <MindMapView
                    note={activeNote}
                    isExpanded={isMindMapExpanded}
                    onToggleExpanded={() => setIsMindMapExpanded(!isMindMapExpanded)}
                  />
                )}
                {isAudioNote(activeNote) && activeNote.status === 'completed' && activeNote.metadata.audioUrl && (
                  <AudioPlayer
                    audioUrl={activeNote.metadata.audioUrl}
                    transcript={activeNote.content}
                    title={activeNote.title}
                  />
                )}
                {isAudioNote(activeNote) && activeNote.status === 'failed' && (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                      <X className="w-6 h-6 text-destructive" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-destructive">Generation Failed</h3>
                      <p className="text-sm text-muted-foreground mt-1">{activeNote.metadata.error || 'An error occurred while generating the audio overview'}</p>
                    </div>
                  </div>
                )}
                {isWrittenQuestionsNote(activeNote) && <WrittenQuestionsView note={activeNote} onNoteUpdate={(updatedNote) => onUpdateNoteFull?.(activeNote.id, updatedNote)} />}
            </div>
        ) : (
            <div className="p-4 space-y-8">
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 font-sans">Create</h3>
                  <div className={`grid gap-3 ${width > 450 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {tools.map((tool) => {
                      const Icon = IconMap[tool.iconName] || FileText;
                      return (
                        <div
                          key={tool.id}
                          onClick={() => handleToolClick(tool.id)}
                          className="group flex flex-col justify-between p-3 h-24 bg-card border border-border rounded-lg hover:shadow-md hover:border-primary/50 transition-all cursor-pointer"
                        >
                           <div className="flex justify-between items-start w-full">
                             <Icon className={`w-5 h-5 ${tool.color} opacity-90 group-hover:scale-110 transition-transform`} />
                           </div>
                           <span className="text-sm font-medium text-foreground leading-tight font-sans tracking-tight">{tool.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                     <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest font-sans">Saved</h3>
                  </div>
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        onClick={() => handleNoteClick(note)}
                        className="relative bg-card border-l-4 border-l-primary border-y border-r border-border p-3 pl-4 shadow-sm hover:shadow-md transition-shadow group rounded-r-sm cursor-pointer"
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 flex gap-3 min-w-0">
                            {note.status === 'generating' ? (
                              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                              </div>
                            ) : (
                              <>
                                {note.type === 'audio' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isAudioNote(note) && note.status === 'completed' && note.metadata.audioUrl) {
                                        onPlayAudio?.(note.metadata.audioUrl, note.title, note.content, note.id);
                                      }
                                    }}
                                    className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all group/play"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current ml-0.5 shrink-0" />
                                  </button>
                                )}
                                {note.type === 'flashcard' && (
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center">
                                    <Layers className="w-4 h-4 shrink-0" />
                                  </div>
                                )}
                                {note.type === 'report' && (
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                                    <FileText className="w-4 h-4 shrink-0" />
                                  </div>
                                )}
                                {note.type === 'quiz' && (
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
                                    <HelpCircle className="w-4 h-4 shrink-0" />
                                  </div>
                                )}
                                {note.type === 'mindmap' && (
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-fuchsia-500/10 text-fuchsia-600 flex items-center justify-center">
                                    <GitFork className="w-4 h-4 shrink-0" />
                                  </div>
                                )}
                                {note.type === 'writtenQuestions' && (
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                                    <MessageSquareText className="w-4 h-4 shrink-0" />
                                  </div>
                                )}
                              </>
                            )}
                            <div className="flex-1 min-w-0">
                                {editingId === note.id ? (
                                    <input
                                        ref={inputRef}
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        onBlur={handleSaveEdit}
                                        onKeyDown={handleKeyDown}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full bg-transparent border-b border-primary text-sm font-bold text-foreground font-serif focus:outline-none mb-1 p-0 rounded-none"
                                    />
                                ) : (
                                    <h4 className="text-sm font-bold text-foreground font-serif truncate leading-tight mb-1 group-hover:text-primary transition-colors">{note.title}</h4>
                                )}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {note.status === 'generating' ? (
                                    <span className="font-mono tracking-tight text-primary italic">Generating...</span>
                                  ) : (
                                    <span className="font-mono tracking-tight">{note.preview}</span>
                                  )}
                                </div>
                            </div>
                          </div>
                          <div className="relative kebab-menu shrink-0">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === note.id ? null : note.id);
                                }}
                                className="text-muted-foreground hover:text-foreground p-1 rounded-sm hover:bg-secondary transition-colors flex items-center justify-center shrink-0"
                            >
                              <MoreVertical className="w-3.5 h-3.5 shrink-0" />
                            </button>
                            {activeMenuId === note.id && (
                                <div className="absolute right-0 top-6 w-36 bg-popover border border-border shadow-lg rounded-md z-50 py-1 animate-in fade-in zoom-in-95 duration-100">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleStartEdit(note); }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-accent text-popover-foreground flex items-center gap-2"
                                    >
                                        <Pencil className="w-3.5 h-3.5 shrink-0" /> Rename
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteNoteWithConfirmation(note); setActiveMenuId(null); }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-destructive/10 text-destructive flex items-center gap-2"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete
                                    </button>
                                </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
            </div>
        )}
      </div>

      {!activeNote && !miniPlayerVisible && (
          <div className="p-4 border-t border-border bg-sidebar/30 mt-auto">
            <button className="w-full py-2 bg-sidebar-accent border border-sidebar-border text-sidebar-foreground text-xs font-bold uppercase tracking-wide rounded-sm hover:bg-sidebar-accent/80 transition-colors shadow-sm">
              + Add New Note
            </button>
          </div>
      )}

      {/* Mini Audio Player */}
      {miniPlayerVisible && miniPlayerData && (
        <MiniAudioPlayer
          audioUrl={miniPlayerData.audioUrl}
          title={miniPlayerData.title}
          transcript={miniPlayerData.transcript}
          isVisible={miniPlayerVisible}
          onClose={onCloseMiniPlayer || (() => {})}
          onExpand={onExpandAudioPlayer || (() => {})}
        />
      )}
      </div>

      {/* Modals */}
      <CreateReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSelectFormat={handleCreateReport}
      />

      <CustomizeFlashcardsModal
        isOpen={isFlashcardModalOpen}
        onClose={() => setIsFlashcardModalOpen(false)}
        onGenerate={handleCreateFlashcards}
      />

      <CustomizeQuizModal
        isOpen={isQuizModalOpen}
        onClose={() => setIsQuizModalOpen(false)}
        onGenerate={handleCreateQuiz}
      />

      <CustomizeAudioModal
        isOpen={isAudioModalOpen}
        onClose={() => setIsAudioModalOpen(false)}
        onGenerate={handleCreateAudio}
      />

      <CustomizeWrittenQuestionsModal
        isOpen={isWrittenQuestionsModalOpen}
        onClose={() => setIsWrittenQuestionsModalOpen(false)}
        onGenerate={handleCreateWrittenQuestions}
      />
      <ConfirmDialogComponent />
    </>);
};
