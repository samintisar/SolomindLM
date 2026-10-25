/**
 * Saves the showcase prompt packs to the owner's Prompt Library, the rows `studio/prompts`
 * `createPrompt` makes. Matched by owner, Studio tool and title, so re-running updates the text in
 * place; `publish` makes them public, as the Prompt Library's Publish does.
 */
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { type MutationCtx } from "../_generated/server";
import { internalMutation } from "../functions";
import { ownerByEmail } from "./db";
import { SHOWCASE_PROMPTS, type ShowcasePrompt } from "./promptPacks";

/** Read cap: one owner's prompts for one Studio tool. */
const MAX_PROMPTS_PER_TOOL = 200;

async function findOwnPrompt(
  ctx: MutationCtx,
  owner: Doc<"users">,
  prompt: ShowcasePrompt
): Promise<Doc<"studioPrompts"> | null> {
  const rows = await ctx.db
    .query("studioPrompts")
    .withIndex("by_user_and_studioTool", (q) =>
      q.eq("userId", owner._id).eq("studioTool", prompt.studioTool)
    )
    .take(MAX_PROMPTS_PER_TOOL);
  // A saved copy of someone else's public prompt has `sourcePromptId`; it isn't ours to edit.
  return rows.find((row) => row.title === prompt.title && !row.sourcePromptId) ?? null;
}

/** Creates or updates every pack prompt; with `publish`, makes them public. Returns the titles changed. */
export const syncShowcasePrompts = internalMutation({
  args: { ownerEmail: v.string(), publish: v.boolean() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const changed: string[] = [];
    const now = Date.now();
    for (const prompt of Object.values(SHOWCASE_PROMPTS) as ShowcasePrompt[]) {
      const existing = await findOwnPrompt(ctx, owner, prompt);
      if (!existing) {
        await ctx.db.insert("studioPrompts", {
          userId: owner._id,
          title: prompt.title,
          description: prompt.description,
          promptText: prompt.text,
          studioTool: prompt.studioTool,
          visibility: args.publish ? "public" : "private",
          ...(args.publish ? { publishedAt: now } : {}),
          status: "active",
          saveCount: 0,
          ratingCount: 0,
          ratingSum: 0,
          createdAt: now,
          updatedAt: now,
        });
        changed.push(prompt.title);
        continue;
      }
      const textChanged =
        existing.promptText !== prompt.text || existing.description !== prompt.description;
      const toPublish = args.publish && existing.visibility !== "public";
      if (!textChanged && !toPublish) continue;
      await ctx.db.patch("studioPrompts", existing._id, {
        promptText: prompt.text,
        description: prompt.description,
        updatedAt: now,
        ...(toPublish ? { visibility: "public" as const, publishedAt: now } : {}),
      });
      changed.push(prompt.title);
    }
    return changed;
  },
});

/** Rollback: make the pack prompts private again (saved copies other people made stay theirs). */
export const unpublishShowcasePrompts = internalMutation({
  args: { ownerEmail: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const changed: string[] = [];
    for (const prompt of Object.values(SHOWCASE_PROMPTS) as ShowcasePrompt[]) {
      const existing = await findOwnPrompt(ctx, owner, prompt);
      if (!existing || existing.visibility !== "public") continue;
      // As `unpublishPrompt` does.
      await ctx.db.patch("studioPrompts", existing._id, {
        visibility: "private",
        updatedAt: Date.now(),
      });
      changed.push(prompt.title);
    }
    return changed;
  },
});
