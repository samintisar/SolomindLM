import { useState, useCallback } from 'react';
import { Note, Source } from '@/shared/types/index';
import { reportsApi } from '../services/reportsApi';
import { mindMapApi } from '../services/mindMapApi';
import { flashcardsApi } from '../services/flashcardsApi';
import { quizzesApi } from '../services/quizzesApi';
import { getReportSubtitle } from '@/shared/types/reportTypes';
import { FlashcardConfig } from '../components/CustomizeFlashcardsModal';
import { QuizConfig } from '../components/CustomizeQuizModal';
import { AudioConfig } from '../components/CustomizeAudioModal';

export interface UseStudioHandlersProps {
  notes: Note[];
  sources: Source[];
  userId?: string | null;
  noteId?: string | null;
  onAddNote: (note: Note) => void;
  onUpdateNote: (id: string, newTitle: string) => void;
  onUpdateNoteFull?: (id: string, note: Note) => void;
  onDeleteNote: (id: string) => void;
  onSetActiveNoteId: (noteId: string | null) => void;
}

export interface UseStudioHandlersReturn {
  // Modal states
  isReportModalOpen: boolean;
  isFlashcardModalOpen: boolean;
  isQuizModalOpen: boolean;
  isAudioModalOpen: boolean;
  // Modal setters
  setIsReportModalOpen: (open: boolean) => void;
  setIsFlashcardModalOpen: (open: boolean) => void;
  setIsQuizModalOpen: (open: boolean) => void;
  setIsAudioModalOpen: (open: boolean) => void;
  // Handlers
  handleToolClick: (toolId: string) => void;
  handleCreateReport: (formatId: string, customPrompt?: string) => Promise<void>;
  handleCreateFlashcards: (config: FlashcardConfig) => Promise<void>;
  handleCreateQuiz: (config: QuizConfig) => Promise<void>;
  handleCreateMindMap: () => Promise<void>;
  handleCreateAudio: (config: AudioConfig) => void;
}

export function useStudioHandlers({
  notes,
  sources = [],
  userId,
  noteId,
  onAddNote,
  onUpdateNote,
  onUpdateNoteFull,
  onDeleteNote,
  onSetActiveNoteId,
}: UseStudioHandlersProps): UseStudioHandlersReturn {
  // Modal states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);

  const handleCreateFlashcards = useCallback(async (config: FlashcardConfig) => {
    setIsFlashcardModalOpen(false);

    // Get selected document IDs from sources
    const selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      alert('Please select at least one source to generate flashcards');
      return;
    }

    if (!userId || !noteId) {
      alert('Authentication error. Please log in again.');
      return;
    }

    // Card count mapping - use midpoints of ranges
    // fewer: ~15-25, standard: ~30-40, more: ~50-60
    const countMap = { fewer: 20, standard: 35, more: 55 };
    const cardCount = countMap[config.count];

    // Create placeholder note
    const placeholderId = Math.random().toString(36).substr(2, 9);
    const newNote: Note = {
      id: placeholderId,
      title: 'Flashcards', // Initial placeholder - AI will generate descriptive title
      preview: `${cardCount} Cards • ${config.difficulty} • Generating...`,
      type: 'flashcard',
      flashcards: [],
      status: 'generating',
      metadata: {
        cardCount: config.count,
        difficulty: config.difficulty,
        topic: config.topic,
      }
    };

    onAddNote(newNote);
    onSetActiveNoteId(placeholderId);

    try {
      // Call API to create and queue flashcard generation
      const { flashcardId, flashcard } = await flashcardsApi.createFlashcards({
        userId,
        notebookId: noteId,
        documentIds: selectedDocumentIds,
        cardCount,
        difficulty: config.difficulty,
        topic: config.topic || undefined,
      });

      // Update note ID with real flashcard ID
      if (onUpdateNoteFull) {
        onUpdateNoteFull(placeholderId, { ...flashcard, type: 'flashcard' as const });
      }
      onSetActiveNoteId(flashcardId);

      // Start polling for status
      flashcardsApi.pollFlashcardStatus(
        flashcardId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(flashcardId, { ...updatedNote, type: 'flashcard' as const });
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(flashcardId, { ...finalNote, type: 'flashcard' as const });
        }
      }).catch(error => {
        console.error('Flashcard generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === flashcardId) || newNote;
          onUpdateNoteFull(flashcardId, {
            ...failedNote,
            status: 'failed',
            preview: `${cardCount} Cards • ${config.difficulty} • Failed`,
            metadata: {
              ...failedNote.metadata,
              error: error instanceof Error ? error.message : 'Failed to generate flashcards',
            }
          });
        }
      });

    } catch (error) {
      console.error('Failed to create flashcards:', error);
      alert(error instanceof Error ? error.message : 'Failed to create flashcards');
      // Remove the placeholder note
      onDeleteNote(placeholderId);
    }
  }, [sources, userId, noteId, notes, onAddNote, onSetActiveNoteId, onUpdateNoteFull, onDeleteNote]);

  const handleCreateQuiz = useCallback(async (config: QuizConfig) => {
    setIsQuizModalOpen(false);

    // Get selected document IDs from sources
    const selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      alert('Please select at least one source to generate a quiz');
      return;
    }

    if (!userId || !noteId) {
      alert('Authentication error. Please log in again.');
      return;
    }

    // Question count mapping
    const countMap = { fewer: 10, standard: 20, more: 30 };
    const questionCount = countMap[config.count];

    // Create placeholder note
    const placeholderId = Math.random().toString(36).substr(2, 9);
    const newNote: Note = {
      id: placeholderId,
      title: 'Quiz', // Initial placeholder - AI will generate descriptive title
      preview: `${questionCount} Questions • ${config.difficulty} • Generating...`,
      type: 'quiz',
      questions: [],
      status: 'generating',
      metadata: {
        questionCount: config.count,
        difficulty: config.difficulty,
        focus: config.focus,
      }
    };

    onAddNote(newNote);
    onSetActiveNoteId(placeholderId);

    try {
      // Call API to create and queue quiz generation
      const { quizId, quiz } = await quizzesApi.createQuiz({
        userId,
        notebookId: noteId,
        documentIds: selectedDocumentIds,
        questionCount: config.count,
        difficulty: config.difficulty,
        focus: config.focus || undefined,
      });

      // Update note ID with real quiz ID
      if (onUpdateNoteFull) {
        onUpdateNoteFull(placeholderId, { ...quiz, type: 'quiz' as const });
      }
      onSetActiveNoteId(quizId);

      // Start polling for status
      quizzesApi.pollQuizStatus(
        quizId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(quizId, { ...updatedNote, type: 'quiz' as const });
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(quizId, { ...finalNote, type: 'quiz' as const });
        }
      }).catch(error => {
        console.error('Quiz generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === quizId) || newNote;
          onUpdateNoteFull(quizId, {
            ...failedNote,
            status: 'failed',
            preview: `${questionCount} Questions • ${config.difficulty} • Failed`,
            metadata: {
              ...failedNote.metadata,
              error: error instanceof Error ? error.message : 'Failed to generate quiz',
            }
          });
        }
      });

    } catch (error) {
      console.error('Failed to create quiz:', error);
      alert(error instanceof Error ? error.message : 'Failed to create quiz');
      // Remove the placeholder note
      onDeleteNote(placeholderId);
    }
  }, [sources, userId, noteId, notes, onAddNote, onSetActiveNoteId, onUpdateNoteFull, onDeleteNote]);

  const handleCreateReport = useCallback(async (formatId: string, customPrompt?: string) => {
    setIsReportModalOpen(false);

    // Get selected document IDs from sources
    const selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      alert('Please select at least one source to generate a report');
      return;
    }

    if (!userId || !noteId) {
      alert('Authentication error. Please log in again.');
      return;
    }

    const titles: Record<string, string> = {
      'briefing': 'Briefing Document',
      'study_guide': 'Study Guide',
      'blog_post': 'Blog Post',
      'summary': 'Summary',
      'technical_report': 'Technical Report',
      'concept_explainer': 'Concept Explainer',
      'methodology_overview': 'Methodology Overview',
      'custom': 'Custom Report'
    };

    // Create note with generating status (placeholder ID)
    const placeholderId = Math.random().toString(36).substr(2, 9);
    const newNote: Note = {
      id: placeholderId,
      title: titles[formatId] || 'New Report',
      preview: getReportSubtitle(formatId),
      type: 'report',
      content: '',
      status: 'generating',
      metadata: {
        reportType: formatId,
      }
    };

    onAddNote(newNote);
    onSetActiveNoteId(placeholderId);

    try {
      // Call API to create and queue report
      const { reportId, note } = await reportsApi.createReport({
        userId,
        noteId,
        documentIds: selectedDocumentIds,
        reportType: formatId,
        customPrompt,
      });

      // Update note ID with real report ID
      if (onUpdateNoteFull) {
        onUpdateNoteFull(placeholderId, { ...note, type: 'report' as const });
      }
      onSetActiveNoteId(reportId);

      // Start polling for status
      reportsApi.pollReportStatus(
        reportId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(reportId, { ...updatedNote, type: 'report' as const });
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(reportId, { ...finalNote, type: 'report' as const });
        }
      }).catch(error => {
        console.error('Report generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === reportId) || newNote;
          const reportType = failedNote.metadata?.reportType || formatId;
          onUpdateNoteFull(reportId, {
            ...failedNote,
            status: 'failed',
            preview: `${getReportSubtitle(reportType)} • Failed`,
            metadata: {
              ...failedNote.metadata,
              error: error instanceof Error ? error.message : 'Failed to generate report',
            }
          });
        }
      });

    } catch (error) {
      console.error('Failed to create report:', error);
      alert(error instanceof Error ? error.message : 'Failed to create report');
      // Remove the placeholder note
      onDeleteNote(placeholderId);
    }
  }, [sources, userId, noteId, notes, onAddNote, onSetActiveNoteId, onUpdateNote, onUpdateNoteFull, onDeleteNote]);

  const handleCreateMindMap = useCallback(async () => {
    // Get selected document IDs from sources
    const selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      alert('Please select at least one source to generate a mind map');
      return;
    }

    if (!userId || !noteId) {
      alert('Authentication error. Please log in again.');
      return;
    }

    // Create note with generating status (placeholder ID)
    const placeholderId = Math.random().toString(36).substr(2, 9);
    const newNote: Note = {
      id: placeholderId,
      title: 'Mind Map',
      preview: 'Mind Map • Generating...',
      type: 'mindmap',
      content: '',
      status: 'generating',
    };

    onAddNote(newNote);
    onSetActiveNoteId(placeholderId);

    try {
      // Call API to create and queue mind map
      const { mindMapId, mindmap } = await mindMapApi.generateMindMap({
        userId,
        notebookId: noteId,
        documentIds: selectedDocumentIds,
      });

      // Create note from mindmap data
      const noteFromMindmap: Note = {
        id: mindmap.id,
        title: mindmap.title,
        preview: 'Mind Map • Visual Overview',
        type: 'mindmap',
        content: JSON.stringify(mindmap.data, null, 2),
        status: mindmap.status as Note['status'],
        metadata: mindmap.metadata,
        mindMapData: mindmap.data,
      };

      // Update note ID with real mind map ID
      if (onUpdateNoteFull) {
        onUpdateNoteFull(placeholderId, noteFromMindmap);
      }
      onSetActiveNoteId(mindMapId);

      // Start polling for status
      mindMapApi.pollMindMapStatus(
        mindMapId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(mindMapId, { ...updatedNote, type: 'mindmap' as const });
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(mindMapId, { ...finalNote, type: 'mindmap' as const });
        }
      }).catch(error => {
        console.error('Mind map generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === mindMapId) || newNote;
          onUpdateNoteFull(mindMapId, {
            ...failedNote,
            status: 'failed',
            preview: 'Mind Map • Failed',
            metadata: {
              ...failedNote.metadata,
              error: error instanceof Error ? error.message : 'Failed to generate mind map',
            }
          });
        }
      });

    } catch (error) {
      console.error('Failed to create mind map:', error);
      alert(error instanceof Error ? error.message : 'Failed to create mind map');
      // Remove the placeholder note
      onDeleteNote(placeholderId);
    }
  }, [sources, userId, noteId, notes, onAddNote, onSetActiveNoteId, onUpdateNoteFull, onDeleteNote]);

  // Tool click handler - defined after handleCreateMindMap to avoid forward reference
  const handleToolClick = useCallback((toolId: string) => {
    if (toolId === 'reports') {
      setIsReportModalOpen(true);
    } else if (toolId === 'flashcards') {
      setIsFlashcardModalOpen(true);
    } else if (toolId === 'quiz') {
      setIsQuizModalOpen(true);
    } else if (toolId === 'audio') {
      setIsAudioModalOpen(true);
    } else if (toolId === 'mindmap') {
      handleCreateMindMap();
    }
  }, [handleCreateMindMap]);

  const handleCreateAudio = useCallback((config: AudioConfig) => {
    setIsAudioModalOpen(false);
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: `Audio: ${config.formatId.replace('_', ' ')}`,
      preview: `Audio Overview • ${config.length}`,
      type: 'audio'
    };
    onAddNote(newNote);
  }, [onAddNote]);

  return {
    isReportModalOpen,
    isFlashcardModalOpen,
    isQuizModalOpen,
    isAudioModalOpen,
    setIsReportModalOpen,
    setIsFlashcardModalOpen,
    setIsQuizModalOpen,
    setIsAudioModalOpen,
    handleToolClick,
    handleCreateReport,
    handleCreateFlashcards,
    handleCreateQuiz,
    handleCreateMindMap,
    handleCreateAudio,
  };
}
