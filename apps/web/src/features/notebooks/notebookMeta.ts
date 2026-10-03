import type { FolderItem, NotebookItem } from "@/shared/types/index";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Sep 12" this year, "Mar 3, 2025" otherwise; null for missing or invalid input. */
export function formatShortDate(
  value: string | number | null | undefined,
  now: Date = new Date()
): string | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Created date, not "edited": `notebooks.updatedAt` only moves on rename/customize/move, so an
 * "edited" label would be wrong after adding sources or chatting.
 */
export function notebookMeta(
  notebook: Pick<NotebookItem, "sourceCount" | "created_at">,
  now?: Date
): string {
  const parts = [count(notebook.sourceCount ?? 0, "source", "sources")];
  const date = formatShortDate(notebook.created_at, now);
  if (date) parts.push(date);
  return parts.join(" · ");
}

export const folderMeta = (folder: Pick<FolderItem, "notebookCount">): string =>
  count(folder.notebookCount ?? 0, "notebook", "notebooks");
