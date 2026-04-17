import { useState, useCallback, useMemo } from "react";
import {
  Note,
  isReportNote,
  isFlashcardNote,
  isSpreadsheetNote,
  isUserNote,
} from "@/shared/types/index";
import { exportFlashcardsCSV } from "../services/flashcardsApi";

interface ConfirmOptions {
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger" | "warning";
}

interface UseNoteActionsProps {
  activeNote: Note | null;
  notes: Note[];
  onUpdateNote: (id: string, newTitle: string) => void;
  onDeleteNote: (id: string) => void;
  confirm: (title: string, message: string, options?: ConfirmOptions) => Promise<boolean>;
}

interface UseNoteActionsResult {
  // Edit state
  editingId: string | null;
  editTitle: string;
  setEditTitle: (value: string) => void;
  // Export state
  isExporting: boolean;
  // Capabilities
  canCopyOrDownloadReport: boolean;
  canCopyOrDownloadUserNote: boolean;
  canExportFlashcards: boolean;
  canDownloadSpreadsheet: boolean;
  // Actions
  handleStartEdit: (note: Note) => void;
  handleSaveEdit: () => void;
  handleEditCancel: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleCopyReport: () => Promise<void>;
  handleDownloadReport: () => void;
  handleCopyUserNote: () => Promise<void>;
  handleDownloadUserNote: () => void;
  handleDownloadSpreadsheet: () => void;
  handleDeleteNote: (note: Note) => Promise<void>;
  handleExportFlashcards: () => Promise<void>;
}

/**
 * Custom hook for note action handlers.
 * Manages editing state, copy/download/export actions, and delete confirmation.
 */
export const useNoteActions = ({
  activeNote,
  notes: _notes,
  onUpdateNote,
  onDeleteNote,
  confirm,
}: UseNoteActionsProps): UseNoteActionsResult => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Check if current note can have report copied/downloaded
  const canCopyOrDownloadReport = useMemo(() => {
    return Boolean(activeNote && isReportNote(activeNote) && activeNote.content);
  }, [activeNote]);

  // Check if current note can export flashcards
  const canExportFlashcards = useMemo(() => {
    return Boolean(activeNote && isFlashcardNote(activeNote));
  }, [activeNote]);

  // Check if current note can download as CSV (spreadsheet)
  const canDownloadSpreadsheet = useMemo(() => {
    return Boolean(activeNote && isSpreadsheetNote(activeNote) && activeNote.content);
  }, [activeNote]);

  // Check if current user note has copyable/downloadable content (content or messages)
  const canCopyOrDownloadUserNote = useMemo(() => {
    if (!activeNote || !isUserNote(activeNote)) return false;
    if (activeNote.content && activeNote.content.trim()) return true;
    if (activeNote.messages && activeNote.messages.length > 0) return true;
    return false;
  }, [activeNote]);

  // Start inline editing
  const handleStartEdit = useCallback((note: Note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
  }, []);

  // Save edit
  const handleSaveEdit = useCallback(() => {
    if (editingId && editTitle.trim()) {
      onUpdateNote(editingId, editTitle.trim());
    }
    setEditingId(null);
  }, [editingId, editTitle, onUpdateNote]);

  // Cancel edit
  const handleEditCancel = useCallback(() => {
    setEditingId(null);
  }, []);

  // Handle keyboard during edit
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSaveEdit();
      if (e.key === "Escape") handleEditCancel();
    },
    [handleSaveEdit, handleEditCancel]
  );

  // Copy report to clipboard
  const handleCopyReport = useCallback(async () => {
    if (!activeNote || !isReportNote(activeNote) || !activeNote.content) return;

    try {
      await navigator.clipboard.writeText(activeNote.content);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }, [activeNote]);

  // Download report as markdown
  const handleDownloadReport = useCallback(() => {
    if (!activeNote || !isReportNote(activeNote) || !activeNote.content) return;

    const safeName = activeNote.title.replace(/[\\/:*?"<>|]/g, "_").trim() || "report";
    const filename = `${safeName}.md`;
    const blob = new Blob([activeNote.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeNote]);

  // Get user note body as plain text (content or messages formatted)
  const getUserNoteBody = useCallback((note: Note): string => {
    if (!isUserNote(note)) return "";
    if (note.content && note.content.trim()) return note.content;
    if (note.messages && note.messages.length > 0) {
      return note.messages
        .map((m) => `${m.role === "user" ? "You" : "Assistant"}: ${m.content}`)
        .join("\n\n");
    }
    return "";
  }, []);

  // Copy user note to clipboard
  const handleCopyUserNote = useCallback(async () => {
    if (!activeNote || !isUserNote(activeNote)) return;
    const body = getUserNoteBody(activeNote);
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }, [activeNote, getUserNoteBody]);

  // Download user note as .md or .txt
  const handleDownloadUserNote = useCallback(() => {
    if (!activeNote || !isUserNote(activeNote)) return;
    const body = getUserNoteBody(activeNote);
    if (!body) return;
    const safeName = activeNote.title.replace(/[\\/:*?"<>|]/g, "_").trim() || "note";
    const filename = `${safeName}.md`;
    const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeNote, getUserNoteBody]);

  // Download spreadsheet as CSV
  const handleDownloadSpreadsheet = useCallback(() => {
    if (!activeNote || !isSpreadsheetNote(activeNote) || !activeNote.content) return;

    const safeName = activeNote.title.replace(/[^a-z0-9]/gi, "_").trim() || "spreadsheet";
    const filename = `${safeName}.csv`;
    const blob = new Blob([activeNote.content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeNote]);

  // Delete note with confirmation
  const handleDeleteNote = useCallback(
    async (note: Note) => {
      const confirmed = await confirm(
        "Delete Note",
        `Are you sure you want to delete "${note.title}"? This action cannot be undone.`,
        { confirmText: "Delete", cancelText: "Cancel", variant: "danger" }
      );
      if (confirmed) {
        onDeleteNote(note.id);
      }
    },
    [confirm, onDeleteNote]
  );

  // Export flashcards as CSV
  const handleExportFlashcards = useCallback(async () => {
    if (!activeNote || !isFlashcardNote(activeNote)) return;

    try {
      setIsExporting(true);
      await exportFlashcardsCSV(activeNote.id, activeNote.title, activeNote.flashcards);
    } catch (error) {
      console.error("Failed to export flashcards:", error);
      alert("Failed to export flashcards. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [activeNote]);

  return {
    editingId,
    editTitle,
    setEditTitle,
    isExporting,
    canCopyOrDownloadReport,
    canCopyOrDownloadUserNote,
    canExportFlashcards,
    canDownloadSpreadsheet,
    handleStartEdit,
    handleSaveEdit,
    handleEditCancel,
    handleKeyDown,
    handleCopyReport,
    handleDownloadReport,
    handleCopyUserNote,
    handleDownloadUserNote,
    handleDownloadSpreadsheet,
    handleDeleteNote,
    handleExportFlashcards,
  };
};
