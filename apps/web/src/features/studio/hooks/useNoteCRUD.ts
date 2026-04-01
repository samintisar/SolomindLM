import { useCallback } from 'react';
import { Note } from '@/shared/types/index';
import { useNotes } from '../services/notesApi';
import { useUpdateReport, useDeleteReport } from '../services/reportsApi';
import { useRenameFlashcards, useDeleteFlashcards } from '../services/flashcardsApi';
import { useRenameQuiz, useDeleteQuiz } from '../services/quizzesApi';
import { useRenameMindMap, useDeleteMindMap } from '../services/mindMapApi';
import { useUpdateAudioOverview, useDeleteAudioOverview } from '../services/audioApi';
import { useRenameWrittenQuestions, useDeleteWrittenQuestions } from '../services/writtenQuestionsApi';
import { useRenameSlideDeck, useDeleteSlideDeck } from '../services/slidesApi';
import { useRenameSpreadsheet, useDeleteSpreadsheet } from '../services/spreadsheetsApi';
import { useUpdateUserNote, useDeleteUserNote } from '@/features/chat/services/userNotesApi';

interface UseNoteCRUDProps {
  activeNotebookId: string | null;
}

type RenameFn = (id: string, title: string) => Promise<void>;
type DeleteFn = (id: string) => Promise<void>;

function alertError(error: unknown, fallback: string) {
  console.error(fallback, error);
  alert(error instanceof Error ? error.message : fallback);
}

export function useNoteCRUD({ activeNotebookId }: UseNoteCRUDProps) {
  const notes = useNotes(
    activeNotebookId && activeNotebookId !== 'new' ? activeNotebookId : null
  );

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

  const renameRegistry = new Map<string, RenameFn>([
    ['report', (id, title) => updateReport(id, { title })],
    ['flashcard', renameFlashcards],
    ['quiz', renameQuiz],
    ['mindmap', renameMindMap],
    ['audioOverview', (id, title) => updateAudioOverview(id, { title })],
    ['writtenQuestions', renameWrittenQuestions],
    ['slides', renameSlideDeck],
    ['spreadsheet', renameSpreadsheet],
    ['note', (id, title) => updateUserNote(id, { title })],
  ]);

  const deleteRegistry = new Map<string, DeleteFn>([
    ['report', deleteReport],
    ['flashcard', deleteFlashcards],
    ['quiz', deleteQuiz],
    ['mindmap', deleteMindMap],
    ['audioOverview', deleteAudioOverview],
    ['writtenQuestions', deleteWrittenQuestions],
    ['slides', deleteSlideDeck],
    ['spreadsheet', deleteSpreadsheet],
    ['note', deleteUserNote],
  ]);

  const handleUpdateNote = useCallback(async (id: string, newTitle: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note || !newTitle.trim()) return;
    const rename = renameRegistry.get(note.type);
    if (!rename) {
      console.warn('Unknown note type for update:', (note as Note).type);
      return;
    }
    try {
      await rename(id, newTitle.trim());
    } catch (error) {
      alertError(error, 'Failed to update note');
    }
  }, [notes, renameRegistry]);

  const handleDeleteNote = useCallback(async (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const del = deleteRegistry.get(note.type);
    if (!del) {
      console.warn('Unknown note type for delete:', (note as Note).type);
      return;
    }
    try {
      await del(id);
    } catch (error) {
      alertError(error, 'Failed to delete note');
    }
  }, [notes, deleteRegistry]);

  const handleSaveReportContent = useCallback(async (reportId: string, content: string) => {
    await updateReport(reportId, { content });
  }, [updateReport]);

  const handleUpdateNoteFull = useCallback((_id: string, _note: Note) => {}, []);

  const handleAddNote = useCallback((_note: Note) => {}, []);

  return {
    notes,
    handleUpdateNote,
    handleDeleteNote,
    handleUpdateNoteFull,
    handleAddNote,
    handleSaveReportContent,
  };
}
