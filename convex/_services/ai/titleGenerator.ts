"use node";
import { v } from "convex/values";
import { uncachedLlmCall } from "../../_agents/_shared/cachedLlm";
import { internalAction } from "../../_generated/server";
import { env } from "../../_lib/env";

/**
 * Generate a short title from a text chunk via Together (uncachedLlmCall includes transient retries).
 * Tries env.FAST_LLM first, then env.SMART_LLM if the fast path fails.
 */
export const generateTitle = internalAction({
  args: {
    chunk: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (_ctx, args) => generateTitleFromChunk(args.chunk),
});

/**
 * Same as `generateTitle`, but callable inline from an action that is already running,
 * so a caller-side timeout does not leave a detached child action running.
 */
export async function generateTitleFromChunk(chunk: string): Promise<string> {
  const apiKey = process.env.TOGETHER_AI_API_KEY;
  if (!apiKey) {
    throw new Error("TOGETHER_AI_API_KEY environment variable is not set");
  }

  // Studio callers send a sample spread across the whole item (`studio/_job/titleSource.ts`).
  const truncatedContent = chunk.length > 1500 ? chunk.substring(0, 1500) + "..." : chunk;

  const prompt = `Generate a single, concise title (max 10 words) for the following content. The title must describe the content as a whole, not one part of it. Output ONLY the title with no preamble, no list, no introduction, and no quotation marks.

Content:
${truncatedContent}

Title:`;

  /** Strip quotes; first line only; cap at 10 words (prompt contract). */
  function finalizeTitle(raw: string): string {
    const t = raw.trim().replace(/^["']|["']$/g, "");
    const line = t.split(/\n/)[0]?.trim() ?? "";
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length > 10) return words.slice(0, 10).join(" ");
    return line;
  }

  async function titleFromModel(model: string): Promise<string> {
    const response = await uncachedLlmCall({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      // Reasoning models (e.g. GPT-OSS on Together) may consume part of the completion budget
      // for traces; 50 was too small and could cut titles mid-phrase (e.g. after "100×").
      maxTokens: 128,
      reasoningEnabled: false,
      toolChoice: "none",
    });
    const title = finalizeTitle(response.content);
    if (!title) throw new Error(`Title model ${model} returned no title`);
    return title;
  }

  try {
    let title: string;
    try {
      title = await titleFromModel(env.FAST_LLM);
    } catch (firstError) {
      if (env.SMART_LLM !== env.FAST_LLM) {
        console.warn("[TitleGenerator] fast model failed, retrying with smart model:", firstError);
        title = await titleFromModel(env.SMART_LLM);
      } else {
        throw firstError;
      }
    }
    console.log("[TitleGenerator] Generated title:", title);
    return title;
  } catch (error) {
    console.error("[TitleGenerator] Error:", error);
    throw new Error("Failed to generate title", { cause: error });
  }
}
