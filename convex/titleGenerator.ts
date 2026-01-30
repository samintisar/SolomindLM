"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

/**
 * Generate a title for content based on a text chunk
 * This action uses Together AI's meta-llama/Llama-3.2-3B-Instruct-Turbo model
 */
export const generateTitle = internalAction({
  args: {
    chunk: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    "use node";

    const apiKey = process.env.TOGETHER_AI_API_KEY;
    if (!apiKey) {
      throw new Error("TOGETHER_AI_API_KEY environment variable is not set");
    }

    // Import the LLM classes directly to avoid circular dependencies
    const { PromptTemplate } = await import("@langchain/core/prompts");
    const { ChatTogetherAI } = await import("@langchain/community/chat_models/togetherai");

    const llm = new ChatTogetherAI({
      apiKey,
      model: args.model || "meta-llama/Llama-3.2-3B-Instruct-Turbo",
      temperature: 0.3,
    });

    const promptTemplate = PromptTemplate.fromTemplate(
      "Generate a concise, descriptive title (max 10 words) for this document chunk:\n\n{chunk}\n\nTitle:"
    );

    try {
      const prompt = await promptTemplate.format({ chunk: args.chunk });
      const response = await llm.invoke(prompt);
      let title = response.content.toString().trim();
      // Remove quotation marks from the start and end of the title
      title = title.replace(/^["']|["']$/g, "");
      console.log("[TitleGenerator] Generated title:", title);
      return title;
    } catch (error) {
      console.error("[TitleGenerator] Error:", error);
      throw new Error("Failed to generate title");
    }
  },
});
