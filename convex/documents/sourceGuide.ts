"use node";
/**
 * Source Guide Generator
 *
 * Generates a per-document summary + topic chips using the fast LLM.
 * Falls back to smart LLM on parse failure.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getAuthUserId } from "../auth";
import { uncachedLlmCall } from "../_agents/_shared/cachedLlm";
import { env } from "../_lib/env";

/** Best-effort fixes before JSON.parse (models sometimes emit trailing commas). */
function repairJsonObjectText(json: string): string {
  return json.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
}

function parseSourceGuidePayload(raw: string): {
  summary: string;
  topics: string[];
} {
  let text = raw.trim();
  if (!text) {
    throw new Error("empty LLM content");
  }

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    text = fence[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("no JSON object in LLM output");
  }
  text = text.slice(start, end + 1);

  let parsed: { summary?: unknown; topics?: unknown };
  try {
    parsed = JSON.parse(text) as { summary?: unknown; topics?: unknown };
  } catch {
    parsed = JSON.parse(repairJsonObjectText(text)) as {
      summary?: unknown;
      topics?: unknown;
    };
  }

  if (!parsed.summary || !Array.isArray(parsed.topics)) {
    throw new Error("Invalid response structure");
  }

  return {
    summary: String(parsed.summary),
    topics: parsed.topics.map(String).filter(Boolean),
  };
}

async function generateSourceGuideWithModel(
  model: string,
  prompt: string
): Promise<{ summary: string; topics: string[] }> {
  const response = await uncachedLlmCall({
    model,
    messages: [
      {
        role: "system",
        content:
          "You output only a single JSON object. Keys: summary (string, 2-3 sentences), topics (string array, 4-6 items, 2-4 words each). Escape quotes inside strings with backslash. No tools, no markdown, no explanation.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    maxTokens: 512,
    responseFormat: { type: "json_object" },
    reasoningEnabled: false,
    toolChoice: "none",
  });

  const parsed = parseSourceGuidePayload(response.content);
  if (parsed.topics.length === 0) {
    throw new Error("Invalid response structure");
  }
  return parsed;
}

export const generateSourceGuide = action({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      console.warn("[sourceGuide] Unauthenticated");
      return;
    }

    // Verify document exists and is completed
    const document = await ctx.runQuery(
      internal.documents.index.getDocumentInternal,
      { documentId: args.documentId, userId }
    );

    if (!document) {
      console.warn("[sourceGuide] Document not found:", args.documentId);
      return;
    }

    if (document.status !== "completed") {
      console.warn("[sourceGuide] Document not completed:", args.documentId);
      return;
    }

    // Skip if already generated
    if (document.sourceGuide) {
      return;
    }

    // Get content
    let content = document.extractedMarkdown || "";
    if (!content) {
      // Fallback: stitch chunks
      const chunks = await ctx.runQuery(
        internal.documents.index.getDocumentChunksInternal,
        { documentId: args.documentId, userId }
      );
      content = chunks.map((c: { content: string }) => c.content).join("\n\n");
    }

    if (content.length < 100) {
      console.warn("[sourceGuide] Content too short, skipping:", args.documentId);
      return;
    }

    // Truncate to avoid exceeding context window (~8000 chars is safe)
    const truncatedContent = content.slice(0, 8000);

    const prompt = `You are an AI study assistant analyzing a source document. Given the document content below, generate a JSON response with exactly these keys:
- "summary": A concise 2-3 sentence overview of the document, highlighting the most important concepts and takeaways. Use bold formatting (markdown **bold**) for key terms.
- "topics": An array of 4-6 specific topics, concepts, or themes covered in the document. Each topic should be 2-4 words, highly specific, and useful as a discussion prompt.

Document content:
${truncatedContent}

Output ONLY a single JSON object. No markdown fences, no explanation.`;

    try {
      let parsed: { summary: string; topics: string[] };
      try {
        parsed = await generateSourceGuideWithModel(env.FAST_LLM, prompt);
      } catch (firstError) {
        if (env.SMART_LLM !== env.FAST_LLM) {
          console.warn(
            "[sourceGuide] fast model failed, retrying with smart model:",
            firstError
          );
          parsed = await generateSourceGuideWithModel(env.SMART_LLM, prompt);
        } else {
          throw firstError;
        }
      }

      await ctx.runMutation(internal.documents.index.setSourceGuide, {
        documentId: args.documentId,
        summary: parsed.summary.slice(0, 500),
        topics: parsed.topics.slice(0, 6),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("LLM API error:")) {
        console.warn("[sourceGuide] LLM API request failed:", error);
      } else {
        console.warn("[sourceGuide] LLM output parse failed:", error);
      }
      // Intentionally do not throw — failing to generate a guide is not a critical error
    }
  },
});
