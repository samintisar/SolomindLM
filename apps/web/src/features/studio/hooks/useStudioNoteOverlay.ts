import { useCallback, useMemo, useState } from "react";
import type { Note } from "@/shared/types/index";
import { mergePendingStudioNotes, prunePendingStudioNotes } from "../utils/mergePendingStudioNotes";

type StudioListOverlayState = {
  notebookId: string | null;
  pending: Note[];
  savedChat: Note | null;
};

/**
 * Optimistic rows layered over the Studio note list: placeholders for generations that haven't
 * been persisted yet, and the "Saved chat" placeholder while a chat is being saved to a note.
 * Scoped to one notebook, so switching notebooks drops the overlay.
 */
export function useStudioNoteOverlay(activeNotebookId: string | null, notes: Note[]) {
  const [overlay, setOverlay] = useState<StudioListOverlayState>({
    notebookId: null,
    pending: [],
    savedChat: null,
  });

  const displayNotes = useMemo(() => {
    const isActive = overlay.notebookId === activeNotebookId;
    const pending = isActive ? overlay.pending : [];
    const withPending = mergePendingStudioNotes(notes, prunePendingStudioNotes(notes, pending));
    if (overlay.savedChat && isActive) {
      return [overlay.savedChat, ...withPending];
    }
    return withPending;
  }, [notes, overlay, activeNotebookId]);

  const addPendingStudioNote = useCallback(
    (note: Note) => {
      if (!activeNotebookId) return;
      setOverlay((prev) => {
        const isActive = prev.notebookId === activeNotebookId;
        const basePending = isActive ? prev.pending : [];
        return {
          notebookId: activeNotebookId,
          pending: [note, ...prunePendingStudioNotes(notes, basePending)],
          savedChat: isActive ? prev.savedChat : null,
        };
      });
    },
    [activeNotebookId, notes]
  );

  const updatePendingStudioNote = useCallback((placeholderId: string, note: Note) => {
    setOverlay((prev) => ({
      ...prev,
      pending: prev.pending.map((pending) => (pending.id === placeholderId ? note : pending)),
    }));
  }, []);

  const removePendingStudioNote = useCallback((id: string) => {
    setOverlay((prev) => ({
      ...prev,
      pending: prev.pending.filter((note) => note.id !== id),
    }));
  }, []);

  const setOptimisticSaveNote = useCallback(
    (payload: { notebookId: string; note: Note } | null) => {
      if (payload === null) {
        setOverlay((prev) => ({ ...prev, savedChat: null }));
        return;
      }
      setOverlay((prev) => ({
        notebookId: payload.notebookId,
        pending: prev.notebookId === payload.notebookId ? prev.pending : [],
        savedChat: payload.note,
      }));
    },
    []
  );

  return {
    displayNotes,
    addPendingStudioNote,
    updatePendingStudioNote,
    removePendingStudioNote,
    setOptimisticSaveNote,
  };
}
