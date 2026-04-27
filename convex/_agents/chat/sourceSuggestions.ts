"use node";
/**
 * Source Suggestions Generator
 *
 * Generates a source summary + study prompts based on uploaded documents.
 * Tries env.FAST_LLM first, then env.SMART_LLM if the fast path fails (API or parse).
 *
 * Together GPT-OSS: reasoning is a separate `message.reasoning` field (not tags in `content`);
 * `uncachedLlmCall` → `togetherChoiceAssistantText` prefers `content`, else `reasoning`.
 * `reasoningEnabled: false` maps to low `reasoning_effort` via mergeModelKwargs; no tool_calls.
 */

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { uncachedLlmCall } from "../_shared/cachedLlm";
import { env } from "../../_lib/env";

/** Best-effort fixes before JSON.parse (models sometimes emit trailing commas). */
function repairJsonObjectText(json: string): string {
  return json.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
}

function parseSuggestionsPayload(raw: string): {
  summary: string;
  suggestions: string[];
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

  let parsed: { summary?: unknown; suggestions?: unknown };
  try {
    parsed = JSON.parse(text) as { summary?: unknown; suggestions?: unknown };
  } catch {
    parsed = JSON.parse(repairJsonObjectText(text)) as {
      summary?: unknown;
      suggestions?: unknown;
    };
  }

  if (!parsed.summary || !Array.isArray(parsed.suggestions)) {
    throw new Error("Invalid response structure");
  }

  return {
    summary: String(parsed.summary),
    suggestions: parsed.suggestions.map(String).filter(Boolean),
  };
}

async function generateSuggestionsWithModel(
  model: string,
  prompt: string
): Promise<{ summary: string; suggestions: string[] }> {
  const response = await uncachedLlmCall({
    model,
    messages: [
      {
        role: "system",
        content:
          "You output only a single JSON object. Keys: summary (string), suggestions (string array, length 3). Escape quotes inside strings with backslash. No tools, no markdown, no explanation.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    maxTokens: 512,
    responseFormat: { type: "json_object" },
    reasoningEnabled: false,
    toolChoice: "none",
  });

  const parsed = parseSuggestionsPayload(response.content);
  if (parsed.suggestions.length === 0) {
    throw new Error("Invalid response structure");
  }
  return parsed;
}

export const generateSuggestionsInternal = internalAction({
  args: {
    notebookId: v.id("notebooks"),
    documentSignature: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const documents = await ctx.runQuery(
      internal.documents.index.listDocumentsForNotebookReadInternal,
      {
        notebookId: args.notebookId,
        userId: args.userId,
      }
    );

    const completed: any[] = (documents as any[]).filter((d: any) => d.status === "completed");

    if (completed.length === 0) {
      return null;
    }

    // Build compact document summary for LLM
    const docLines = completed
      .slice(0, 20)
      .map((d: any) => {
        const flags: string[] = [];
        if (d.metadata?.hasMathNotation) flags.push("math");
        if (d.metadata?.hasCodeBlocks) flags.push("code");
        const type =
          d.fileType === "youtube"
            ? "YouTube video"
            : d.fileType === "url"
              ? "webpage"
              : d.fileType === "text"
                ? "text note"
                : d.fileName?.split(".").pop()?.toUpperCase() || "document";
        return `- "${d.fileName || "Untitled"}" (${type}${flags.length ? `, ${flags.join(", ")}` : ""})`;
      })
      .join("\n");

    const prompt = `You are an AI study assistant. A student has uploaded these sources to a notebook:

${docLines}

Generate a JSON response with:
- "summary": a one-line summary of what these sources cover (max 15 words)
- "suggestions": an array of exactly 3 study-focused questions the student could ask about this material

Keep suggestions short (under 10 words each) and varied. Output a single JSON object only — no markdown fences, no commentary before or after the object.`;

    try {
      let parsed: { summary: string; suggestions: string[] };
      try {
        parsed = await generateSuggestionsWithModel(env.FAST_LLM, prompt);
      } catch (firstError) {
        if (env.SMART_LLM !== env.FAST_LLM) {
          console.warn(
            "[sourceSuggestions] fast model failed, retrying with smart model:",
            firstError
          );
          parsed = await generateSuggestionsWithModel(env.SMART_LLM, prompt);
        } else {
          throw firstError;
        }
      }

      return {
        sourceCount: completed.length,
        summary: parsed.summary.slice(0, 100),
        suggestions: parsed.suggestions.slice(0, 3),
        documentSignature: args.documentSignature,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("LLM API error:")) {
        console.warn("[sourceSuggestions] LLM API request failed:", error);
      } else {
        console.warn("[sourceSuggestions] LLM output parse failed:", error);
      }
      return {
        sourceCount: completed.length,
        summary: null,
        suggestions: null,
        documentSignature: args.documentSignature,
      };
    }
  },
});
