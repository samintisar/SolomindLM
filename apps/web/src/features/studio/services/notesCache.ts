import { api } from "@convex/_generated/api";
import type { OptimisticLocalStore } from "convex/browser";

/**
 * Optimistic-update helpers for the notes queries the Studio panel reads.
 *
 * The open item comes from `api.notes.index.get` (args `{ type, id }`, the full
 * document) and the saved list from `api.notes.index.list` (args
 * `{ notebookId, types? }`, rows summarized by `convex/notes/listSummary.ts`).
 * The per-type queries (`api.studio.<type>.index.get/list`) back no list or open
 * item, so patching only those leaves the panel waiting on the server.
 *
 * Every cached copy is matched by id, so neither the notebookId nor the exact
 * args are needed. Ids are unique across tables, so the type is not checked.
 */

type NotesListRow = { _id: unknown; [key: string]: unknown };

/**
 * Patch one item in every cached notes query. `notes.get` takes the whole
 * patch; list rows only take `title`, since the list strips or truncates heavy
 * fields (content, data, transcript, ...). Undefined fields are ignored.
 */
export function patchNoteInNotesCache(
  localStore: OptimisticLocalStore,
  id: string,
  patch: Record<string, unknown>
): void {
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
  if (Object.keys(defined).length === 0) return;

  for (const { args, value } of localStore.getAllQueries(api.notes.index.get)) {
    if (args.id !== id || !value) continue;
    localStore.setQuery(api.notes.index.get, args, { ...value, ...defined } as typeof value);
  }

  const { title } = defined;
  if (title === undefined) return;
  for (const { args, value } of localStore.getAllQueries(api.notes.index.list)) {
    if (!value?.some((row: NotesListRow) => row._id === id)) continue;
    localStore.setQuery(
      api.notes.index.list,
      args,
      value.map((row: NotesListRow) => (row._id === id ? { ...row, title } : row))
    );
  }
}

/**
 * Remove one item from every cached notes query: its `notes.get` becomes null
 * (so the panel closes it) and its row leaves every `notes.list`.
 */
export function removeNoteFromNotesCache(localStore: OptimisticLocalStore, id: string): void {
  for (const { args, value } of localStore.getAllQueries(api.notes.index.get)) {
    if (args.id !== id || value === undefined) continue;
    localStore.setQuery(api.notes.index.get, args, null);
  }

  for (const { args, value } of localStore.getAllQueries(api.notes.index.list)) {
    if (!value?.some((row: NotesListRow) => row._id === id)) continue;
    localStore.setQuery(
      api.notes.index.list,
      args,
      value.filter((row: NotesListRow) => row._id !== id)
    );
  }
}
