import { useCallback } from "react";
import { useDeleteUserNote, useUpdateUserNote } from "@/features/chat/services/userNotesApi";
import { Note } from "@/shared/types/index";
import { useDeleteAudioOverview, useUpdateAudioOverview } from "../services/audioApi";
import { useDeleteFlashcard, useRenameFlashcard } from "../services/flashcardsApi";
import { useDeleteInfographic, useRenameInfographic } from "../services/infographicApi";
import { useDeleteMindMap, useRenameMindMap } from "../services/mindMapApi";
import { useNotes } from "../services/notesApi";
import { useDeleteQuiz, useRenameQuiz } from "../services/quizzesApi";
import { useDeleteReport, useUpdateReport } from "../services/reportsApi";
import { useDeleteSpreadsheet, useRenameSpreadsheet } from "../services/spreadsheetsApi";
import {
  useDeleteWrittenQuestions,
  useRenameWrittenQuestions,
} from "../services/writtenQuestionsApi";

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
  const notes = useNotes(activeNotebookId && activeNotebookId !== "new" ? activeNotebookId : null);

  const updateReport = useUpdateReport();
  const deleteReport = useDeleteReport();
  const renameFlashcards = useRenameFlashcard();
  const deleteFlashcards = useDeleteFlashcard();
  const renameQuiz = useRenameQuiz();
  const deleteQuiz = useDeleteQuiz();
  const renameMindMap = useRenameMindMap();
  const deleteMindMap = useDeleteMindMap();
  const updateAudioOverview = useUpdateAudioOverview();
  const deleteAudioOverview = useDeleteAudioOverview();
  const renameWrittenQuestions = useRenameWrittenQuestions();
  const deleteWrittenQuestions = useDeleteWrittenQuestions();
  const renameInfographic = useRenameInfographic();
  const deleteInfographic = useDeleteInfographic();
  const renameSpreadsheet = useRenameSpreadsheet();
  const deleteSpreadsheet = useDeleteSpreadsheet();
  const updateUserNote = useUpdateUserNote();
  const deleteUserNote = useDeleteUserNote();

  const handleUpdateNote = useCallback(
    async (id: string, newTitle: string) => {
      const note = notes.find((n) => n.id === id);
      if (!note || !newTitle.trim()) return;
      const renameRegistry = new Map<string, RenameFn>([
        ["report", (id, title) => updateReport(id, { title })],
        ["flashcard", renameFlashcards],
        ["quiz", renameQuiz],
        ["mindmap", renameMindMap],
        ["audioOverview", (id, title) => updateAudioOverview(id, { title })],
        ["writtenQuestions", renameWrittenQuestions],
        ["infographic", renameInfographic],
        ["spreadsheet", renameSpreadsheet],
        ["note", (id, title) => updateUserNote(id, { title })],
      ]);
      const rename = renameRegistry.get(note.type);
      if (!rename) {
        console.warn("Unknown note type for update:", (note as Note).type);
        return;
      }
      try {
        await rename(id, newTitle.trim());
      } catch (error) {
        alertError(error, "Failed to update note");
      }
    },
    [
      notes,
      updateReport,
      renameFlashcards,
      renameQuiz,
      renameMindMap,
      updateAudioOverview,
      renameWrittenQuestions,
      renameInfographic,
      renameSpreadsheet,
      updateUserNote,
    ]
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      const note = notes.find((n) => n.id === id);
      if (!note) return;
      const deleteRegistry = new Map<string, DeleteFn>([
        ["report", deleteReport],
        ["flashcard", deleteFlashcards],
        ["quiz", deleteQuiz],
        ["mindmap", deleteMindMap],
        ["audioOverview", deleteAudioOverview],
        ["writtenQuestions", deleteWrittenQuestions],
        ["infographic", deleteInfographic],
        ["spreadsheet", deleteSpreadsheet],
        ["note", deleteUserNote],
      ]);
      const del = deleteRegistry.get(note.type);
      if (!del) {
        console.warn("Unknown note type for delete:", (note as Note).type);
        return;
      }
      try {
        await del(id);
      } catch (error) {
        alertError(error, "Failed to delete note");
      }
    },
    [
      notes,
      deleteReport,
      deleteFlashcards,
      deleteQuiz,
      deleteMindMap,
      deleteAudioOverview,
      deleteWrittenQuestions,
      deleteInfographic,
      deleteSpreadsheet,
      deleteUserNote,
    ]
  );

  const handleSaveReportContent = useCallback(
    async (reportId: string, content: string) => {
      await updateReport(reportId, { content });
    },
    [updateReport]
  );

  return {
    notes,
    handleUpdateNote,
    handleDeleteNote,
    handleSaveReportContent,
  };
}
