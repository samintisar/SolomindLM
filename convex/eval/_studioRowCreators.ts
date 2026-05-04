/**
 * Eval-only row creators for studio types whose `_model` files don't expose a
 * `createInternal` mutation (mindmaps, infographics, audio overviews). The mutations
 * here mirror the row-creation step that the public `mutation()` wrappers in
 * those modules do, but skip the auth/limit gates — the eval action itself
 * already gated on RAG_EVAL_SECRET and resolved identity from the notebook
 * owner.
 *
 * Internal mutations (not exposed to the public API). Used only from
 * [studioEvalAction.ts](./studioEvalAction.ts).
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import * as Mindmaps from "../_model/mindmaps";
import * as Infographics from "../_model/infographics";
import * as AudioOverviews from "../_model/audioOverviews";

export const createMindmapInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    return await Mindmaps.createMindmap(ctx, {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      data: {},
      metadata: {},
      status: "generating",
    });
  },
});

export const createInfographicInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    return await Infographics.createInfographic(ctx, {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      data: {},
      metadata: {},
      status: "generating",
    });
  },
});

export const createAudioOverviewInternal = internalMutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    title: v.string(),
    audioType: v.optional(v.string()),
    length: v.optional(v.string()),
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await AudioOverviews.createAudioOverview(ctx, {
      userId: args.userId,
      notebookId: args.notebookId,
      title: args.title,
      metadata: {
        audioType: args.audioType ?? "deep_dive",
        length: args.length ?? "default",
        focus: args.focus,
      },
      status: "generating",
    });
  },
});
