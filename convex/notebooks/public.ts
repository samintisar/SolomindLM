import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, type QueryCtx, query } from "../_generated/server";
import { assertFeedbackAdmin } from "../_lib/feedbackAdmin";
import { checkNotebookLimit } from "../_lib/limits";
import { assertNotebookOwner } from "../_lib/notebookAccess";
import { rateLimiter } from "../_lib/rateLimits";
import { getAuthUserId } from "../auth";
import { performNotebookFork } from "./_forkNotebook";

/** The Featured shelf is curated by hand, so a small cap is plenty. */
const FEATURED_LIMIT = 24;

async function toPublicNotebookDTO(
  ctx: QueryCtx,
  notebook: Doc<"notebooks">,
  viewerId: Id<"users">
) {
  // No source count: counting reads every document row, once per card.
  const owner = await ctx.db.get(notebook.userId);
  return {
    id: notebook._id,
    title: notebook.title,
    date: new Date(notebook.updatedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    coverColor: notebook.coverColor ?? "bg-vintage-brown-300",
    icon: notebook.icon ?? "Book",
    created_at: notebook.createdAt,
    updated_at: notebook.updatedAt,
    isPublic: true,
    isFeatured: notebook.isFeatured ?? false,
    publishedAt: notebook.publishedAt ?? notebook.updatedAt,
    ownerName: owner?.name ?? "SolomindLM user",
    isOwnedByViewer: notebook.userId === viewerId,
  };
}

/** Owner publishes or unpublishes. Unpublishing also drops the notebook from the Featured shelf. */
export const setPublic = mutation({
  args: { notebookId: v.id("notebooks"), isPublic: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const notebook = await assertNotebookOwner(ctx, args.notebookId, userId);
    if (args.isPublic) {
      // Re-publishing must not move the notebook to the top of the Community grid.
      if (!notebook.isPublic) {
        // `isFeatured` used to be a per-user pin; a pin left from then must not feature the
        // notebook. Only an admin features a public notebook (`setFeatured`).
        await ctx.db.patch(args.notebookId, {
          isPublic: true,
          isFeatured: false,
          publishedAt: Date.now(),
        });
      }
    } else {
      await ctx.db.patch(args.notebookId, {
        isPublic: false,
        isFeatured: false,
        publishedAt: undefined,
      });
    }
    return { isPublic: args.isPublic };
  },
});

/** Community grid: public, not featured, newest published first. */
export const listPublic = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { page: [], isDone: true, continueCursor: "" };

    const result = await ctx.db
      .query("notebooks")
      .withIndex("by_isPublic_and_publishedAt", (q) => q.eq("isPublic", true))
      .order("desc")
      .filter((q) => q.neq(q.field("isFeatured"), true))
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((nb) => toPublicNotebookDTO(ctx, nb, userId))),
    };
  },
});

/** Featured shelf: admin-curated public notebooks, newest published first. */
export const listFeatured = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query("notebooks")
      .withIndex("by_isFeatured_and_publishedAt", (q) => q.eq("isFeatured", true))
      .order("desc")
      .take(FEATURED_LIMIT);

    return await Promise.all(
      rows.filter((nb) => nb.isPublic).map((nb) => toPublicNotebookDTO(ctx, nb, userId))
    );
  },
});

export const setFeatured = mutation({
  args: { notebookId: v.id("notebooks"), isFeatured: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertFeedbackAdmin(ctx, userId);

    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook) throw new Error("Notebook not found");
    if (args.isFeatured && !notebook.isPublic) {
      throw new Error("Only public notebooks can be featured");
    }
    await ctx.db.patch(args.notebookId, { isFeatured: args.isFeatured });
    return { isFeatured: args.isFeatured };
  },
});

/** Admin moderation: take any notebook off the Public tab. */
export const adminUnpublish = mutation({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertFeedbackAdmin(ctx, userId);

    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook) throw new Error("Notebook not found");
    await ctx.db.patch(args.notebookId, {
      isPublic: false,
      isFeatured: false,
      publishedAt: undefined,
    });
    return { ok: true as const };
  },
});

/** Copy a public notebook into the caller's account. */
export const forkPublic = mutation({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook?.isPublic) throw new Error("Notebook not found");

    await rateLimiter.limit(ctx, "notebookFork", { key: userId, throws: true });

    await checkNotebookLimit(ctx);
    const newNotebookId = await performNotebookFork(ctx, args.notebookId, userId);
    return { newNotebookId };
  },
});
