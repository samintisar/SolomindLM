"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getAuthUserId } from "../auth";

/**
 * Map file extensions to their proper MIME types
 */
function getMimeType(fileName: string, providedMimeType: string): string {
  if (providedMimeType && providedMimeType !== "application/octet-stream") {
    return providedMimeType;
  }

  const ext = fileName.toLowerCase().split(".").pop();

  const mimeTypeMap: Record<string, string> = {
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    htm: "text/html",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    zip: "application/zip",
  };

  return ext && mimeTypeMap[ext] ? mimeTypeMap[ext] : providedMimeType;
}

/**
 * Upload a file to Convex storage
 */
export const uploadFile = action({
  args: {
    file: v.any(),
    fileName: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    "use node";

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }

    const { file, fileName, contentType } = args;

    console.log("[ConvexStorage] Starting file upload:", {
      fileName,
      contentType,
      fileSize: file.size || file.length,
    });

    const fileSize = file.size || file.length;
    if (fileSize === 0) {
      throw new Error("File is empty");
    }

    const _properMimeType = getMimeType(fileName, contentType);

    const storageId = await ctx.storage.store(file);
    const url = await ctx.storage.getUrl(storageId);

    console.log("[ConvexStorage] Upload successful:", { storageId, url });

    return {
      storageId,
      url,
    };
  },
});

/**
 * Get a public URL for a storage ID
 */
export const getStorageUrl = action({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    "use node";

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const canAccess = await ctx.runQuery(internal.documents.internal.userCanAccessStorage, {
      userId,
      storageId: args.storageId,
    });
    if (!canAccess) {
      throw new Error("Access denied");
    }
    const url = await ctx.storage.getUrl(args.storageId);
    return url;
  },
});

/**
 * Upload an audio buffer to Convex storage
 */
export const uploadAudioBuffer = action({
  args: {
    buffer: v.any(),
    audioOverviewId: v.string(),
  },
  handler: async (ctx, args) => {
    "use node";

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }

    const { buffer, audioOverviewId } = args;

    console.log("[ConvexStorage] Starting audio upload:", {
      audioOverviewId,
      fileSize: buffer.length,
    });

    if (buffer.length === 0) {
      throw new Error("Audio buffer is empty");
    }

    const blob = new Blob([buffer], { type: "audio/mpeg" });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);

    console.log("[ConvexStorage] Audio upload successful:", { storageId, url });

    return {
      storageId,
      url,
    };
  },
});

/**
 * Delete a file from Convex storage
 * Note: Convex doesn't support deletion, files are automatically garbage collected
 * This function is a no-op but kept for API compatibility
 */
export const deleteFile = action({
  args: {
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    "use node";

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    if (args.storageId) {
      const canAccess = await ctx.runQuery(internal.documents.internal.userCanAccessStorage, {
        userId,
        storageId: args.storageId,
      });
      if (!canAccess) {
        throw new Error("Access denied");
      }
    }
    console.log("[ConvexStorage] Delete requested (no-op, GC handles cleanup):", args.storageId);
    return;
  },
});
