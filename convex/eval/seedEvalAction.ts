/**
 * Gated actions for the use-case eval pack seeder (`bun run eval:seed`) and
 * the eval CLI's pack resolution. Same gate as the other eval actions
 * (RAG_EVALS_ENABLED + RAG_EVAL_SECRET, see `_gate.ts`). The notebook owner is
 * always RAG_EVAL_OWNER_EMAIL; callers never pass a user id.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { assertRagEvalGate } from "./_gate";
import {
  type PackNotebook,
  type PackSourceText,
  packNotebookValidator,
  packSourceTextValidator,
} from "./_seedPack";

function requireOwnerEmail(): string {
  const email = process.env.RAG_EVAL_OWNER_EMAIL?.trim();
  if (!email) {
    throw new Error(
      "RAG_EVAL_OWNER_EMAIL is not set on this deployment (email of the account that owns the eval pack notebooks)."
    );
  }
  return email;
}

export const resolvePackNotebook = action({
  args: { evalSecret: v.string(), notebookTitle: v.string() },
  returns: v.union(v.null(), packNotebookValidator),
  handler: async (ctx, args): Promise<PackNotebook | null> => {
    assertRagEvalGate(args.evalSecret);
    return await ctx.runQuery(internal.eval._seedPack.findPackNotebook, {
      ownerEmail: requireOwnerEmail(),
      notebookTitle: args.notebookTitle,
    });
  },
});

export const createPackNotebook = action({
  args: { evalSecret: v.string(), notebookTitle: v.string() },
  returns: v.id("notebooks"),
  handler: async (ctx, args): Promise<Id<"notebooks">> => {
    assertRagEvalGate(args.evalSecret);
    return await ctx.runMutation(internal.eval._seedPack.createPackNotebook, {
      ownerEmail: requireOwnerEmail(),
      notebookTitle: args.notebookTitle,
    });
  },
});

export const getEvalUploadUrl = action({
  args: { evalSecret: v.string() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    assertRagEvalGate(args.evalSecret);
    return await ctx.storage.generateUploadUrl();
  },
});

export const addPackDocument = action({
  args: {
    evalSecret: v.string(),
    notebookId: v.id("notebooks"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    sha256: v.string(),
  },
  returns: v.id("documents"),
  handler: async (ctx, args): Promise<Id<"documents">> => {
    assertRagEvalGate(args.evalSecret);
    const { evalSecret: _secret, ...rest } = args;
    return await ctx.runMutation(internal.eval._seedPack.insertPackDocument, {
      ...rest,
      ownerEmail: requireOwnerEmail(),
    });
  },
});

export const removePackDocument = action({
  args: { evalSecret: v.string(), documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertRagEvalGate(args.evalSecret);
    await ctx.runMutation(internal.eval._seedPack.deletePackDocument, {
      ownerEmail: requireOwnerEmail(),
      documentId: args.documentId,
    });
    return null;
  },
});

export const getPackSourceText = action({
  args: { evalSecret: v.string(), documentIds: v.array(v.id("documents")) },
  returns: packSourceTextValidator,
  handler: async (ctx, args): Promise<PackSourceText> => {
    assertRagEvalGate(args.evalSecret);
    const ownerEmail = requireOwnerEmail();
    // One query per document: a single query over a large pack could exceed the read limit.
    const perDocument = await Promise.all(
      args.documentIds.map((documentId) =>
        ctx.runQuery(internal.eval._seedPack.packSourceText, {
          ownerEmail,
          documentIds: [documentId],
        })
      )
    );
    return perDocument.flat();
  },
});
