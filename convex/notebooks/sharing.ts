import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { checkNotebookLimit } from "../_lib/limits";
import { assertNotebookOwner, getNotebookMember } from "../_lib/notebookAccess";
import { rateLimiter } from "../_lib/rateLimits";
import { generateShareToken, hashShareToken } from "../_lib/shareToken";
import * as Notebooks from "../_model/notebooks";
import { getAuthUserId } from "../auth";
import { performNotebookFork } from "./_forkNotebook";

async function findActiveShareByTokenHash(ctx: { db: any }, tokenHash: string) {
  const row = await ctx.db
    .query("notebookShareLinks")
    .withIndex("by_token_hash", (q: any) => q.eq("tokenHash", tokenHash))
    .first();
  if (!row || row.revokedAt !== undefined) {
    return null;
  }
  return row;
}

/**
 * Owner creates a new share link. Plaintext `token` is returned once for URL building.
 */
export const createShareLink = mutation({
  args: {
    notebookId: v.id("notebooks"),
    kind: v.union(v.literal("collaborate"), v.literal("fork")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertNotebookOwner(ctx, args.notebookId, userId);

    const token = generateShareToken();
    const tokenHash = await hashShareToken(token);
    const now = Date.now();

    const shareLinkId = await ctx.db.insert("notebookShareLinks", {
      notebookId: args.notebookId,
      kind: args.kind,
      tokenHash,
      createdByUserId: userId,
      createdAt: now,
    });

    return { shareLinkId, token, kind: args.kind, notebookId: args.notebookId };
  },
});

/**
 * Owner lists share links for a notebook (no secret tokens).
 */
export const listShareLinks = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const nb = await ctx.db.get(args.notebookId);
    if (!nb || nb.userId !== userId) return [];

    const links = await ctx.db
      .query("notebookShareLinks")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();

    return links.map((l) => ({
      id: l._id,
      kind: l.kind,
      createdAt: l.createdAt,
      revokedAt: l.revokedAt ?? null,
      active: l.revokedAt === undefined,
    }));
  },
});

/**
 * Owner revokes a share link (cannot be used for redeem/fork afterward).
 */
export const revokeShareLink = mutation({
  args: { shareLinkId: v.id("notebookShareLinks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const link = await ctx.db.get(args.shareLinkId);
    if (!link) throw new Error("Share link not found");

    await assertNotebookOwner(ctx, link.notebookId, userId);

    if (link.revokedAt === undefined) {
      await ctx.db.patch(args.shareLinkId, { revokedAt: Date.now() });
    }

    return { ok: true as const };
  },
});

/**
 * Redeem a collaborate link: adds current user as editor on the notebook.
 */
export const redeemCollaborateLink = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await rateLimiter.limit(ctx, "shareRedeem", { key: userId, throws: true });

    const tokenHash = await hashShareToken(args.token.trim());
    const link = await findActiveShareByTokenHash(ctx, tokenHash);
    if (!link || link.kind !== "collaborate") {
      throw new Error("Invalid or expired share link");
    }

    const notebook = await Notebooks.getNotebook(ctx, link.notebookId);
    if (!notebook) throw new Error("Notebook not found");

    if (notebook.userId === userId) {
      return { notebookId: link.notebookId, alreadyHadAccess: true as const };
    }

    const existing = await getNotebookMember(ctx, link.notebookId, userId);
    if (!existing) {
      await ctx.db.insert("notebookMembers", {
        notebookId: link.notebookId,
        userId,
        role: "editor",
        joinedAt: Date.now(),
      });
    }

    return { notebookId: link.notebookId, alreadyHadAccess: false as const };
  },
});

/**
 * Fork notebook using a fork-only share link (new notebook under current user).
 */
export const forkNotebookFromToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await rateLimiter.limit(ctx, "notebookFork", { key: userId, throws: true });

    const tokenHash = await hashShareToken(args.token.trim());
    const link = await findActiveShareByTokenHash(ctx, tokenHash);
    if (!link || link.kind !== "fork") {
      throw new Error("Invalid or expired fork link");
    }

    await checkNotebookLimit(ctx);

    const newNotebookId = await performNotebookFork(ctx, link.notebookId, userId);

    return { newNotebookId };
  },
});

/**
 * Resolve a share token to notebook id + kind without redeeming (for fork landing UI).
 * Does not add membership or consume fork.
 */
export const peekShareToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const tokenHash = await hashShareToken(args.token.trim());
    const link = await findActiveShareByTokenHash(ctx, tokenHash);
    if (!link) return null;

    const notebook = await Notebooks.getNotebook(ctx, link.notebookId);
    if (!notebook) return null;

    return {
      notebookId: link.notebookId,
      kind: link.kind,
      title: notebook.title,
    };
  },
});
