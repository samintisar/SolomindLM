import type { Note } from "@/shared/types/index";

/**
 * Merge optimistic pending studio notes with server-backed notes.
 * Pending entries appear first; server rows win when ids overlap.
 */
export function mergePendingStudioNotes(queryNotes: Note[], pendingNotes: Note[]): Note[] {
  const queryIds = new Set(queryNotes.map((note) => note.id));
  const pendingOnly = pendingNotes.filter((note) => !queryIds.has(note.id));
  return [...pendingOnly, ...queryNotes];
}

/**
 * Drop pending placeholders once the unified query includes the same id.
 */
export function prunePendingStudioNotes(queryNotes: Note[], pendingNotes: Note[]): Note[] {
  const queryIds = new Set(queryNotes.map((note) => note.id));
  return pendingNotes.filter((note) => !queryIds.has(note.id));
}
