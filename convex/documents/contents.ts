/**
 * A document's extracted text, stored in `documentContents` rather than on the `documents` row
 * (#598). Convex bills the whole row on every read, so text on the row made every list of
 * sources pay for every source's text. Read the text only where it is shown or processed.
 *
 * Until `_migration/moveDocumentText` has run, older rows still hold their text in the deprecated
 * `documents.extractedMarkdown`; reads fall back to it and writes clear it.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

async function getContentRow(ctx: QueryCtx, documentId: Id<"documents">) {
  return await ctx.db
    .query("documentContents")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .unique();
}

/** The document's stored text, or undefined when none has been stored. */
export async function getDocumentText(
  ctx: QueryCtx,
  document: Pick<Doc<"documents">, "_id" | "extractedMarkdown">
): Promise<string | undefined> {
  const row = await getContentRow(ctx, document._id);
  return row?.extractedMarkdown ?? document.extractedMarkdown;
}

/**
 * Stores the document's text (undefined deletes it) and clears the deprecated copy on the row.
 * The caller makes sure the document exists.
 */
export async function setDocumentText(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  extractedMarkdown: string | undefined
): Promise<void> {
  const row = await getContentRow(ctx, documentId);
  if (extractedMarkdown === undefined) {
    if (row) await ctx.db.delete(row._id);
  } else if (row) {
    await ctx.db.patch(row._id, { extractedMarkdown });
  } else {
    await ctx.db.insert("documentContents", { documentId, extractedMarkdown });
  }
  await ctx.db.patch(documentId, { extractedMarkdown: undefined });
}

/** Deletes the document's text; call when deleting the document. */
export async function deleteDocumentText(
  ctx: MutationCtx,
  documentId: Id<"documents">
): Promise<void> {
  const row = await getContentRow(ctx, documentId);
  if (row) await ctx.db.delete(row._id);
}
