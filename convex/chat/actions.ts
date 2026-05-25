import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Generate a title for a conversation using the AI title generator.
 */
export const generateAndSetTitle = internalAction({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const title: string = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
      chunk: args.content,
    });
    await ctx.runMutation(internal.chat.messages.setTitleInternal, {
      conversationId: args.conversationId,
      title,
    });
  },
});
