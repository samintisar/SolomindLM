import type { NotebookItem } from "@/shared/types/index";

export interface NotebookHeaderProps {
  /** Owner only: editors (cowork link) and viewers (public notebook) see a read-only title. */
  renamable: boolean;
  /** Owner only. */
  canShare: boolean;
  /** "Public · by Ada" when viewing someone's public notebook. */
  byline: string | undefined;
  /** Viewing someone's public notebook: copy it into your account. */
  canFork: boolean;
}

/** What the app header offers for the open notebook, by your role in it. */
export function notebookHeaderProps(
  activeNotebook: NotebookItem | undefined,
  isNotebookRoute: boolean
): NotebookHeaderProps {
  const access = isNotebookRoute ? activeNotebook?.access : undefined;
  const isViewer = access === "viewer";
  return {
    renamable: access === "owner",
    canShare: access === "owner",
    byline: isViewer ? `Public · by ${activeNotebook?.ownerName ?? "SolomindLM user"}` : undefined,
    canFork: isViewer,
  };
}

/**
 * The open notebook isn't in your list and the server no longer returns it (unpublished or
 * deleted). False while anything is still loading, and while a cowork `?share=` link is being
 * redeemed (the notebook is briefly unreadable until you join it).
 */
export function isVisitedNotebookGone(state: {
  urlNotebookId: string | null;
  hasShareToken: boolean;
  listLoaded: boolean;
  listed: boolean;
  visited: NotebookItem | null | undefined;
}): boolean {
  return (
    state.urlNotebookId !== null &&
    state.urlNotebookId !== "new" &&
    !state.hasShareToken &&
    state.listLoaded &&
    !state.listed &&
    state.visited === null
  );
}
