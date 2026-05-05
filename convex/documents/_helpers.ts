import { type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function deleteAllChunksForDocument(
  ctx: MutationCtx,
  documentId: Id<"documents">
): Promise<void> {
  const chunks = await ctx.db
    .query("documentChunks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  for (const chunk of chunks) {
    await ctx.db.delete(chunk._id);
  }
}

// Known file extensions so we can preserve them when renaming (keeps PDF/DOCX etc. labels correct)
export const FILE_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "xlsx",
  "xls",
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
  "wav",
  "mp3",
  "m4a",
  "webm",
  "flac",
]);
