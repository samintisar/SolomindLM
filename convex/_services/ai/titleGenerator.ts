"use node";
import { internalAction } from "../../_generated/server";
import { v } from "convex/values";

/**
 * Generate a title for content based on a text chunk
 * This action uses env.FAST_LLM (Together AI) with reasoning disabled.
 * Includes retry logic for 503 errors with exponential backoff.
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

    const { uncachedLlmCall } = await import("../../_agents/_shared/cachedLlm");
    const { env } = await import("../../_lib/env");

    const model = args.model || env.FAST_LLM;
    // FIX: Truncate input to prevent token budget issues
    // Use first 500 chars for title generation (enough context, fits in budget)
    const truncatedContent = args.chunk.length > 500
      ? args.chunk.substring(0, 500) + "..."
      : args.chunk;

    const prompt = `Generate a single, concise title (max 10 words) for the following content. Output ONLY the title with no preamble, no list, no introduction, and no quotation marks.\n\nContent:\n${truncatedContent}\n\nTitle:`;

    // Add retry logic with exponential backoff for 503 errors
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // FIX: Removed toolChoice parameter (not supported by Together AI OSS models)
        // FIX: Truncated input content to 500 chars to prevent token budget issues
        const response = await uncachedLlmCall({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          maxTokens: 30,
          reasoningEnabled: false,
        });
        let title = response.content.trim();
        title = title.replace(/^["']|["']$/g, "");
        console.log("[TitleGenerator] Generated title:", title);
        return title;
      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message;

        // Only retry on 503 errors or network issues
        const isRetryable = errorMessage.includes('503') ||
                           errorMessage.includes('Service unavailable') ||
                           errorMessage.includes('ETIMEDOUT') ||
                           errorMessage.includes('ECONNRESET');

        if (!isRetryable || attempt === maxRetries) {
          console.error(`[TitleGenerator] Error (attempt ${attempt}/${maxRetries}):`, error);
          throw new Error("Failed to generate title");
        }

        // Exponential backoff with jitter: 1s, 2s, 4s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        const jitter = Math.random() * 500;
        console.log(`[TitleGenerator] Retry ${attempt}/${maxRetries} after ${Math.round(delay + jitter)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error("Failed to generate title");
  },
});
