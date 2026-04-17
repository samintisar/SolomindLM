import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { buildErrorMetadata } from "./jobErrorUtils";

export const updateDocumentJobStatus = internalMutation({
  args: {
    documentId: v.id("documents"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { documentId, status, metadata } = args;
    await ctx.db.patch(documentId, {
      status,
      ...(metadata && { metadata }),
    });
    return documentId;
  },
});

export const markDocumentJobFailed = internalMutation({
  args: {
    documentId: v.id("documents"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { documentId, error, metadata } = args;
    const errorMetadata = buildErrorMetadata(error, metadata?.phase || "unknown", metadata);
    await ctx.db.patch(documentId, {
      status: "failed",
      error,
      metadata: {
        ...metadata,
        ...errorMetadata,
      },
    });
  },
});
