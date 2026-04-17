import { v } from "convex/values";
import { action } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";

/**
 * Public action: fetches source-aware suggestions for the chat empty state.
 *
 * Thin wrapper — all Node.js-dependent work (LLM call) lives in
 * convex/_agents/chat/sourceSuggestions.ts to avoid "crypto" bundling errors.
 */
export const getSourceSuggestions = action({
  args: {
    notebookId: v.id("notebooks"),
    documentSignature: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    sourceCount: number;
    summary: string | null;
    suggestions: string[] | null;
    documentSignature: string;
  } | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return ctx.runAction(internal._agents.chat.sourceSuggestions.generateSuggestionsInternal, {
      notebookId: args.notebookId,
      documentSignature: args.documentSignature,
    });
  },
});
