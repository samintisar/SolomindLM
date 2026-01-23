import { useState, useCallback } from 'react';
import { Note, Source } from '@/shared/types/index';
import { reportsApi } from '../services/reportsApi';
import { mindMapApi } from '../services/mindMapApi';
import { flashcardsApi } from '../services/flashcardsApi';
import { quizzesApi } from '../services/quizzesApi';
import { audioApi } from '@/features/audio/api/audioApi';
import { writtenQuestionsApi } from '../services/writtenQuestionsApi';
import { slidesApi } from '../services/slidesApi';
import { spreadsheetsApi, getSpreadsheetTypeLabel } from '../services/spreadsheetsApi';
import { getReportSubtitle } from '@/shared/types/reportTypes';
import { FlashcardConfig } from '../components/CustomizeFlashcardsModal';
import { QuizConfig } from '../components/CustomizeQuizModal';
import { AudioConfig } from '../components/CustomizeAudioModal';
import { WrittenQuestionsConfig } from '../components/CustomizeWrittenQuestionsModal';
import { SlideDeckConfig } from '../components/CustomizeSlidesModal';
import { SpreadsheetConfig } from '../components/CustomizeSpreadsheetsModal';

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
  confirm?: (title: string, message: string | React.ReactNode, options?: {
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'default';
  }) => Promise<boolean>;
}

export interface UseStudioHandlersReturn {
  // Modal states
  isReportModalOpen: boolean;
  isFlashcardModalOpen: boolean;
  isQuizModalOpen: boolean;
  isAudioModalOpen: boolean;
  isWrittenQuestionsModalOpen: boolean;
  isSlidesModalOpen: boolean;
  isSpreadsheetsModalOpen: boolean;
  // Modal setters
  setIsReportModalOpen: (open: boolean) => void;
  setIsFlashcardModalOpen: (open: boolean) => void;
  setIsQuizModalOpen: (open: boolean) => void;
  setIsAudioModalOpen: (open: boolean) => void;
  setIsWrittenQuestionsModalOpen: (open: boolean) => void;
  setIsSlidesModalOpen: (open: boolean) => void;
  setIsSpreadsheetsModalOpen: (open: boolean) => void;
  // Handlers
  handleToolClick: (toolId: string) => void;
  handleCreateReport: (formatId: string, customPrompt?: string) => Promise<void>;
  handleCreateFlashcards: (config: FlashcardConfig) => Promise<void>;
  handleCreateQuiz: (config: QuizConfig) => Promise<void>;
  handleCreateMindMap: () => Promise<void>;
  handleCreateAudio: (config: AudioConfig) => void;
  handleCreateWrittenQuestions: (config: WrittenQuestionsConfig) => void;
  handleCreateSlides: (config: SlideDeckConfig) => Promise<void>;
  handleCreateSpreadsheet: (config: SpreadsheetConfig) => Promise<void>;
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
  confirm,
}: UseStudioHandlersProps): UseStudioHandlersReturn {
  // Modal states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [isWrittenQuestionsModalOpen, setIsWrittenQuestionsModalOpen] = useState(false);
  const [isSlidesModalOpen, setIsSlidesModalOpen] = useState(false);
  const [isSpreadsheetsModalOpen, setIsSpreadsheetsModalOpen] = useState(false);

  const handleCreateFlashcards = useCallback(async (config: FlashcardConfig) => {
    setIsFlashcardModalOpen(false);

    // Get selected document IDs from sources
    let selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      if (confirm) {
        await confirm('No Sources Selected', 'Please select at least one source to generate flashcards', { variant: 'warning' });
      }
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
    const placeholderId = Math.random().toString(36).slice(2, 11);
    const newNote: Note = {
      id: placeholderId,
      title: 'Flashcards', // Initial placeholder - AI will generate descriptive title
      preview: `${cardCount} Cards • ${config.difficulty} • Generating...`,
      type: 'flashcard',
      flashcards: [],
      status: 'generating',
      metadata: {
        cardCount,
        difficulty: config.difficulty,
        topic: config.topic,
      }
    };

    onAddNote(newNote);

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
        onUpdateNoteFull(placeholderId, flashcard);
      }

      // Start polling for status
      flashcardsApi.pollFlashcardStatus(
        flashcardId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(flashcardId, updatedNote);
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(flashcardId, finalNote);
        }
      }).catch(error => {
        console.error('Flashcard generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === flashcardId) || newNote;
          if (failedNote.type === 'flashcard') {
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
    let selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      if (confirm) {
        await confirm('No Sources Selected', 'Please select at least one source to generate a quiz', { variant: 'warning' });
      }
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
    const placeholderId = Math.random().toString(36).slice(2, 11);
    const newNote: Note = {
      id: placeholderId,
      title: 'Quiz', // Initial placeholder - AI will generate descriptive title
      preview: `${questionCount} Questions • ${config.difficulty} • Generating...`,
      type: 'quiz',
      questions: [],
      status: 'generating',
      metadata: {
        questionCount,
        difficulty: config.difficulty,
        focusArea: config.focus,
      }
    };

    onAddNote(newNote);

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
        onUpdateNoteFull(placeholderId, quiz);
      }

      // Start polling for status
      quizzesApi.pollQuizStatus(
        quizId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(quizId, updatedNote);
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(quizId, finalNote);
        }
      }).catch(error => {
        console.error('Quiz generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === quizId) || newNote;
          if (failedNote.type === 'quiz') {
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
    let selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      if (confirm) {
        await confirm('No Sources Selected', 'Please select at least one source to generate a report', { variant: 'warning' });
      }
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
    const placeholderId = Math.random().toString(36).slice(2, 11);
    const newNote: Note = {
      id: placeholderId,
      title: titles[formatId] || 'New Report',
      preview: getReportSubtitle(formatId),
      type: 'report',
      content: '',
      status: 'generating',
      metadata: {
        reportType: formatId,
        documentIds: selectedDocumentIds,
      }
    };

    onAddNote(newNote);

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
        onUpdateNoteFull(placeholderId, note);
      }

      // Start polling for status
      reportsApi.pollReportStatus(
        reportId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(reportId, updatedNote);
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(reportId, finalNote);
        }
      }).catch(error => {
        console.error('Report generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === reportId) || newNote;
          if (failedNote.type === 'report') {
            const reportType = failedNote.metadata.reportType || formatId;
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
    let selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      if (confirm) {
        await confirm('No Sources Selected', 'Please select at least one source to generate a mind map', { variant: 'warning' });
      }
      return;
    }


    if (!userId || !noteId) {
      alert('Authentication error. Please log in again.');
      return;
    }

    // Create note with generating status (placeholder ID)
    const placeholderId = Math.random().toString(36).slice(2, 11);
    const newNote: Note = {
      id: placeholderId,
      title: 'Mind Map',
      preview: 'Mind Map • Generating...',
      type: 'mindmap',
      content: '',
      mindMapData: { nodeData: { id: 'root', topic: '', children: [] } },
      status: 'generating',
      metadata: {},
    };

    onAddNote(newNote);

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

      // Start polling for status
      mindMapApi.pollMindMapStatus(
        mindMapId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(mindMapId, updatedNote);
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(mindMapId, finalNote);
        }
      }).catch(error => {
        console.error('Mind map generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === mindMapId) || newNote;
          if (failedNote.type === 'mindmap') {
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
        }
      });

    } catch (error) {
      console.error('Failed to create mind map:', error);
      alert(error instanceof Error ? error.message : 'Failed to create mind map');
      // Remove the placeholder note
      onDeleteNote(placeholderId);
    }
  }, [sources, userId, noteId, notes, onAddNote, onSetActiveNoteId, onUpdateNoteFull, onDeleteNote]);

  const handleCreateWrittenQuestions = useCallback(async (config: WrittenQuestionsConfig) => {
    setIsWrittenQuestionsModalOpen(false);

    // Get selected document IDs from sources
    let selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      if (confirm) {
        await confirm('No Sources Selected', 'Please select at least one source to generate written questions', { variant: 'warning' });
      }
      return;
    }


    if (!userId || !noteId) {
      alert('Authentication error. Please log in again.');
      return;
    }

    // Question count mapping
    const countMap = { fewer: 5, standard: 10, more: 15 };
    const questionCount = countMap[config.count];

    // Create placeholder note
    const placeholderId = Math.random().toString(36).slice(2, 11);
    const newNote: Note = {
      id: placeholderId,
      title: 'Written Questions', // Initial placeholder - AI will generate descriptive title
      preview: `${questionCount} Questions • ${config.questionType} • Generating...`,
      type: 'writtenQuestions',
      questions: [],
      status: 'generating',
      metadata: {
        questionCount,
        difficulty: config.difficulty,
        questionType: config.questionType,
        focusArea: config.focus,
      }
    };

    onAddNote(newNote);

    try {
      // Call API to create and queue written questions generation
      const { writtenQuestionsId, writtenQuestions } = await writtenQuestionsApi.createWrittenQuestions({
        userId,
        notebookId: noteId,
        documentIds: selectedDocumentIds,
        questionCount: config.count,
        difficulty: config.difficulty,
        questionType: config.questionType,
        focus: config.focus || undefined,
      });

      // Update note ID with real written questions ID
      if (onUpdateNoteFull) {
        onUpdateNoteFull(placeholderId, writtenQuestions);
      }

      // Start polling for status
      writtenQuestionsApi.pollWrittenQuestionsStatus(
        writtenQuestionsId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(writtenQuestionsId, updatedNote);
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(writtenQuestionsId, finalNote);
        }
      }).catch(error => {
        console.error('Written questions generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === writtenQuestionsId) || newNote;
          if (failedNote.type === 'writtenQuestions') {
            onUpdateNoteFull(writtenQuestionsId, {
              ...failedNote,
              status: 'failed',
              preview: `${questionCount} Questions • ${config.questionType} • Failed`,
              metadata: {
                ...failedNote.metadata,
                error: error instanceof Error ? error.message : 'Failed to generate written questions',
              }
            });
          }
        }
      });

    } catch (error) {
      console.error('Failed to create written questions:', error);
      alert(error instanceof Error ? error.message : 'Failed to create written questions');
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
    } else if (toolId === 'slides') {
      setIsSlidesModalOpen(true);
    } else if (toolId === 'audio') {
      setIsAudioModalOpen(true);
    } else if (toolId === 'mindmap') {
      handleCreateMindMap();
    } else if (toolId === 'writtenQuestions') {
      setIsWrittenQuestionsModalOpen(true);
    } else if (toolId === 'spreadsheets') {
      setIsSpreadsheetsModalOpen(true);
    }
  }, [handleCreateMindMap]);

  const handleCreateAudio = useCallback(async (config: AudioConfig) => {
    setIsAudioModalOpen(false);

    // Get selected document IDs from sources
    let selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      if (confirm) {
        await confirm('No Sources Selected', 'Please select at least one source to generate an audio overview', { variant: 'warning' });
      }
      return;
    }


    if (!userId || !noteId) {
      alert('Authentication error. Please log in again.');
      return;
    }

    // Create placeholder note with simple title - AI will generate descriptive title
    const placeholderId = Math.random().toString(36).slice(2, 11);
    const newNote: Note = {
      id: placeholderId,
      title: 'Audio Overview', // Initial placeholder - AI will generate descriptive title
      preview: `Audio Overview • ${config.length} • Generating...`,
      type: 'audio',
      content: '',
      status: 'generating',
      metadata: {
        audioUrl: '',
        audioType: config.formatId,
        audioOverviewId: placeholderId,
      }
    };

    onAddNote(newNote);

    try {
      // Call API to create and queue audio overview generation
      const { audioOverviewId } = await audioApi.createAudioOverview({
        userId,
        notebookId: noteId,
        documentIds: selectedDocumentIds,
        audioType: config.formatId,
        length: config.length,
        focus: config.focus || undefined,
      });

      // Update note ID with real audio overview ID
      if (onUpdateNoteFull) {
        onUpdateNoteFull(placeholderId, {
          ...newNote,
          id: audioOverviewId,
          metadata: {
            audioUrl: '',
            audioType: newNote.metadata.audioType,
            audioOverviewId,
          }
        });
      }

      // Start polling for status
      audioApi.pollAudioOverview(
        audioOverviewId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(audioOverviewId, updatedNote);
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(audioOverviewId, finalNote);
        }
      }).catch(error => {
        console.error('Audio overview generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === audioOverviewId) || newNote;
          if (failedNote.type === 'audio') {
            onUpdateNoteFull(audioOverviewId, {
              ...failedNote,
              id: audioOverviewId,
              status: 'failed',
              preview: `Audio Overview • ${config.formatId.replace('_', ' ')} • Failed`,
              metadata: {
                ...failedNote.metadata,
                error: error instanceof Error ? error.message : 'Failed to generate audio overview',
              }
            });
          }
        }
      });

    } catch (error) {
      console.error('Failed to create audio overview:', error);
      alert(error instanceof Error ? error.message : 'Failed to create audio overview');
      // Remove the placeholder note
      onDeleteNote(placeholderId);
    }
  }, [sources, userId, noteId, notes, onAddNote, onSetActiveNoteId, onUpdateNoteFull, onDeleteNote]);

  const handleCreateSlides = useCallback(async (config: SlideDeckConfig) => {
    setIsSlidesModalOpen(false);

    // Get selected document IDs from sources
    let selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      if (confirm) {
        await confirm('No Sources Selected', 'Please select at least one source to generate a slide deck', { variant: 'warning' });
      }
      return;
    }

    if (!userId || !noteId) {
      alert('Authentication error. Please log in again.');
      return;
    }

    // Slide type and deck length labels
    const typeLabel = config.slideType === 'detailed_deck' ? 'Detailed' : 'Presenter';
    const lengthLabel = config.deckLength === 'short' ? 'Short' : 'Standard';

    // Create placeholder note
    const placeholderId = Math.random().toString(36).slice(2, 11);
    const newNote: Note = {
      id: placeholderId,
      title: 'Slide Deck', // Initial placeholder - AI will generate descriptive title
      preview: `${typeLabel} • ${lengthLabel} • Generating...`,
      type: 'slides',
      slides: [],
      status: 'generating',
      metadata: {
        slideType: config.slideType,
        deckLength: config.deckLength,
        slideCount: 0,
        customPrompt: config.customPrompt,
      }
    };

    onAddNote(newNote);

    try {
      // Call API to create and queue slide deck generation
      const { slideDeckId, slideDeck } = await slidesApi.createSlideDeck({
        userId,
        notebookId: noteId,
        documentIds: selectedDocumentIds,
        slideType: config.slideType,
        deckLength: config.deckLength,
        customPrompt: config.customPrompt || undefined,
      });

      // Update note ID with real slide deck ID
      if (onUpdateNoteFull) {
        onUpdateNoteFull(placeholderId, slideDeck);
      }

      // Start polling for status (longer maxAttempts for image generation)
      slidesApi.pollSlideDeckStatus(
        slideDeckId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(slideDeckId, updatedNote);
          }
        },
        300 // 10 minutes @ 2s intervals (image generation takes time)
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(slideDeckId, finalNote);
        }
      }).catch(error => {
        console.error('Slide deck generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === slideDeckId) || newNote;
          if (failedNote.type === 'slides') {
            onUpdateNoteFull(slideDeckId, {
              ...failedNote,
              status: 'failed',
              preview: `${typeLabel} • ${lengthLabel} • Failed`,
              metadata: {
                ...failedNote.metadata,
                error: error instanceof Error ? error.message : 'Failed to generate slide deck',
              }
            });
          }
        }
      });

    } catch (error) {
      console.error('Failed to create slide deck:', error);
      alert(error instanceof Error ? error.message : 'Failed to create slide deck');
      // Remove the placeholder note
      onDeleteNote(placeholderId);
    }
  }, [sources, userId, noteId, notes, onAddNote, onSetActiveNoteId, onUpdateNoteFull, onDeleteNote]);

  const handleCreateSpreadsheet = useCallback(async (config: SpreadsheetConfig) => {
    setIsSpreadsheetsModalOpen(false);

    // Get selected document IDs from sources
    let selectedDocumentIds = sources.filter(s => s.selected).map(s => s.id);

    if (selectedDocumentIds.length === 0) {
      if (confirm) {
        await confirm('No Sources Selected', 'Please select at least one source to generate a spreadsheet', { variant: 'warning' });
      }
      return;
    }

    if (!userId || !noteId) {
      alert('Authentication error. Please log in again.');
      return;
    }

    // Get type label for display
    const typeLabel = getSpreadsheetTypeLabel(config.spreadsheetType);

    // Create placeholder note
    const placeholderId = Math.random().toString(36).slice(2, 11);
    const newNote: Note = {
      id: placeholderId,
      title: 'Spreadsheet', // Initial placeholder - AI will generate descriptive title
      preview: `Spreadsheet • ${typeLabel} • Generating...`,
      type: 'spreadsheet',
      content: '',
      status: 'generating',
      metadata: {
        spreadsheetType: config.spreadsheetType,
        documentIds: selectedDocumentIds,
        customPrompt: config.customPrompt,
      }
    };

    onAddNote(newNote);

    try {
      // Call API to create and queue spreadsheet generation
      const { spreadsheetId, spreadsheet } = await spreadsheetsApi.createSpreadsheet({
        notebookId: noteId,
        documentIds: selectedDocumentIds,
        spreadsheetType: config.spreadsheetType,
        customPrompt: config.customPrompt || undefined,
      });

      // Update note ID with real spreadsheet ID
      if (onUpdateNoteFull) {
        onUpdateNoteFull(placeholderId, spreadsheet);
      }

      // Start polling for status
      spreadsheetsApi.pollSpreadsheetStatus(
        spreadsheetId,
        (updatedNote) => {
          // Update note during polling
          if (onUpdateNoteFull) {
            onUpdateNoteFull(spreadsheetId, updatedNote);
          }
        }
      ).then(finalNote => {
        // Final update when complete
        if (onUpdateNoteFull) {
          onUpdateNoteFull(spreadsheetId, finalNote);
        }
      }).catch(error => {
        console.error('Spreadsheet generation failed:', error);
        // Update with failed status
        if (onUpdateNoteFull) {
          const failedNote = notes.find(n => n.id === spreadsheetId) || newNote;
          if (failedNote.type === 'spreadsheet') {
            onUpdateNoteFull(spreadsheetId, {
              ...failedNote,
              status: 'failed',
              preview: `Spreadsheet • ${typeLabel} • Failed`,
              metadata: {
                ...failedNote.metadata,
                error: error instanceof Error ? error.message : 'Failed to generate spreadsheet',
              }
            });
          }
        }
      });

    } catch (error) {
      console.error('Failed to create spreadsheet:', error);
      alert(error instanceof Error ? error.message : 'Failed to create spreadsheet');
      // Remove the placeholder note
      onDeleteNote(placeholderId);
    }
  }, [sources, userId, noteId, notes, onAddNote, onSetActiveNoteId, onUpdateNoteFull, onDeleteNote]);

  return {
    isReportModalOpen,
    isFlashcardModalOpen,
    isQuizModalOpen,
    isAudioModalOpen,
    isWrittenQuestionsModalOpen,
    isSlidesModalOpen,
    isSpreadsheetsModalOpen,
    setIsReportModalOpen,
    setIsFlashcardModalOpen,
    setIsQuizModalOpen,
    setIsAudioModalOpen,
    setIsWrittenQuestionsModalOpen,
    setIsSlidesModalOpen,
    setIsSpreadsheetsModalOpen,
    handleToolClick,
    handleCreateReport,
    handleCreateFlashcards,
    handleCreateQuiz,
    handleCreateMindMap,
    handleCreateAudio,
    handleCreateWrittenQuestions,
    handleCreateSlides,
    handleCreateSpreadsheet,
  };
}
