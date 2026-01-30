import type { Note } from '@/shared/types/index';
import { getReportSubtitle, normalizeReportTypeId } from '@/shared/types/reportTypes';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

/**
 * Map a raw database note (with _type discriminator) to the frontend Note interface
 */
function mapDatabaseNoteToNote(dbNote: any): Note {
  const { _type, ...noteData } = dbNote;

  switch (_type) {
    case 'report':
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getReportPreview(dbNote),
        type: 'report',
        content: dbNote.content || '',
        status: dbNote.status,
        metadata: {
          reportType: dbNote.reportType || dbNote.metadata?.reportType || 'custom',
          documentIds: dbNote.metadata?.documentIds || [],
          phase: dbNote.metadata?.phase,
          error: dbNote.metadata?.error,
          chunksProcessed: dbNote.metadata?.chunksProcessed,
        },
      };

    case 'flashcard':
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getFlashcardPreview(dbNote),
        type: 'flashcard',
        flashcards: dbNote.cardsData || [],
        status: dbNote.status,
        metadata: {
          difficulty: dbNote.metadata?.difficulty || 'medium',
          cardCount: dbNote.cardsData?.length || 0,
          topic: dbNote.metadata?.topic,
          error: dbNote.metadata?.error,
        },
      };

    case 'quiz':
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getQuizPreview(dbNote),
        type: 'quiz',
        questions: dbNote.questionsData || [],
        status: dbNote.status,
        metadata: {
          questionCount: dbNote.questionsData?.length || 0,
          difficulty: dbNote.metadata?.difficulty || 'medium',
          focusArea: dbNote.metadata?.focusArea,
          error: dbNote.metadata?.error,
        },
      };

    case 'mindmap':
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getMindMapPreview(dbNote),
        type: 'mindmap',
        mindMapData: { nodeData: dbNote.data || { id: 'root', topic: dbNote.title, children: [] } },
        content: JSON.stringify(dbNote.data),
        status: dbNote.status,
        metadata: {
          phase: dbNote.metadata?.phase,
          error: dbNote.metadata?.error,
        },
      };

    case 'audioOverview':
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getAudioOverviewPreview(dbNote),
        type: 'audioOverview',
        audioUrl: dbNote.audioUrl || '',
        transcript: dbNote.transcript || '',
        status: dbNote.status,
        metadata: dbNote.metadata,
      };

    case 'slides':
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getSlidesPreview(dbNote),
        type: 'slides',
        slides: dbNote.data?.slides || [],
        status: dbNote.status,
        metadata: {
          slideType: dbNote.metadata?.slideType || 'detailed_deck',
          deckLength: dbNote.metadata?.deckLength || 'default',
          slideCount: dbNote.slideCount || 0,
          customPrompt: dbNote.metadata?.customPrompt,
          error: dbNote.metadata?.error,
        },
      };

    case 'spreadsheet':
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getSpreadsheetPreview(dbNote),
        type: 'spreadsheet',
        content: dbNote.data?.content || '',
        status: dbNote.status,
        metadata: {
          spreadsheetType: dbNote.metadata?.spreadsheetType || 'custom',
          documentIds: dbNote.metadata?.documentIds || [],
          phase: dbNote.metadata?.phase,
          error: dbNote.metadata?.error,
          customPrompt: dbNote.metadata?.customPrompt,
        },
      };

    case 'writtenQuestions':
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getWrittenQuestionsPreview(dbNote),
        type: 'writtenQuestions',
        questions: dbNote.questionsData || [],
        status: dbNote.status,
        metadata: {
          questionCount: dbNote.questionsData?.length || 0,
          difficulty: dbNote.metadata?.difficulty || 'medium',
          questionType: dbNote.questionType || 'short',
          focusArea: dbNote.metadata?.focusArea,
          totalPoints: dbNote.metadata?.totalPoints,
          error: dbNote.metadata?.error,
        },
      };

    default:
      throw new Error(`Unknown note type: ${_type}`);
  }
}

/**
 * Helper functions for preview text generation
 */
function getReportPreview(dbNote: any): string {
  const reportType = normalizeReportTypeId(dbNote.reportType || dbNote.metadata?.reportType || 'custom');
  const subtitle = getReportSubtitle(reportType);
  if (dbNote.status === 'generating') return `${subtitle} • Generating...`;
  if (dbNote.status === 'failed') return `${subtitle} • Failed`;
  return subtitle;
}

function getFlashcardPreview(dbNote: any): string {
  const count = dbNote.cardsData?.length || 0;
  if (dbNote.status === 'generating') return `${count} Flashcards • Generating...`;
  if (dbNote.status === 'failed') return `${count} Flashcards • Failed`;
  return `${count} Flashcard${count !== 1 ? 's' : ''}`;
}

function getQuizPreview(dbNote: any): string {
  const count = dbNote.questionsData?.length || 0;
  if (dbNote.status === 'generating') return `${count} Questions • Generating...`;
  if (dbNote.status === 'failed') return `${count} Questions • Failed`;
  return `${count} Question${count !== 1 ? 's' : ''}`;
}

function getMindMapPreview(dbNote: any): string {
  if (dbNote.status === 'generating') return 'Mind Map • Generating...';
  if (dbNote.status === 'failed') return 'Mind Map • Failed';
  return 'Mind Map';
}

function getAudioOverviewPreview(dbNote: any): string {
  if (dbNote.status === 'generating') return 'Audio Overview • Generating...';
  if (dbNote.status === 'failed') return 'Audio Overview • Failed';
  return 'Audio Overview';
}

function getSlidesPreview(dbNote: any): string {
  const count = dbNote.slideCount || 0;
  if (dbNote.status === 'generating') return `${count} Slides • Generating...`;
  if (dbNote.status === 'failed') return `${count} Slides • Failed`;
  return `${count} Slide${count !== 1 ? 's' : ''}`;
}

function getSpreadsheetPreview(dbNote: any): string {
  if (dbNote.status === 'generating') return 'Spreadsheet • Generating...';
  if (dbNote.status === 'failed') return 'Spreadsheet • Failed';
  return 'Spreadsheet';
}

function getWrittenQuestionsPreview(dbNote: any): string {
  const count = dbNote.questionsData?.length || 0;
  if (dbNote.status === 'generating') return `${count} Questions • Generating...`;
  if (dbNote.status === 'failed') return `${count} Questions • Failed`;
  return `${count} Question${count !== 1 ? 's' : ''}`;
}

/**
 * Load all studio notes for a notebook using a SINGLE unified query.
 *
 * This replaces the previous approach that used 8 separate subscriptions.
 *
 * @param notebookId - The notebook ID to load notes for
 * @param types - Optional filter to load only specific note types
 * @returns Array of Note objects
 */
export function useNotes(
  notebookId: string | null,
  types?: string[]
): Note[] {
  const notes = useQuery(
    api.notes.listAllByNotebook,
    notebookId
      ? { notebookId: notebookId as Id<'notebooks'>, types }
      : 'skip'
  );

  // Map raw database notes to frontend Note interfaces
  // No useMemo needed - useQuery already memoizes the result
  return notes?.map(mapDatabaseNoteToNote) ?? [];
}

/**
 * Get note counts by type for a notebook
 */
export function useNoteCounts(notebookId: string | null) {
  return useQuery(
    api.notes.countByType,
    notebookId ? { notebookId: notebookId as Id<'notebooks'> } : 'skip'
  );
}

/**
 * Get a single note by type and ID
 */
export function useNote(type: string, noteId: string | null) {
  const note = useQuery(
    api.notes.getById,
    noteId && type
      ? { type, id: noteId as Id<'documents'> }
      : 'skip'
  );
  return note ? mapDatabaseNoteToNote(note) : null;
}

/**
 * Check if any notes are currently loading
 */
export function useNotesLoading(notebookId: string | null): boolean {
  const notes = useQuery(
    api.notes.listAllByNotebook,
    notebookId
      ? { notebookId: notebookId as Id<'notebooks'> }
      : 'skip'
  );

  // Convex returns undefined while loading, null on error, and the data when ready
  return notes === undefined;
}

// Re-export individual hooks for components that need them
// These still use the optimized individual queries for single-type lookups
export { useReports } from './reportsApi';
export { useFlashcards } from './flashcardsApi';
export { useQuizzes } from './quizzesApi';
export { useMindMaps } from './mindMapApi';
export { useAudioOverviews } from './audioApi';
export { useWrittenQuestions } from './writtenQuestionsApi';
export { useSlideDecks } from './slidesApi';
export { useSpreadsheets } from './spreadsheetsApi';
