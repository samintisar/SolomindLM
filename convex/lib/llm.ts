"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";

// LLM model configurations
export const LLM_MODELS = {
  FAST: "meta-llama/Llama-3.2-3B-Instruct-Turbo",
  SMART: "Qwen/Qwen3-Next-80B-A3B-Instruct",
};

// API endpoint for LLM streaming (external service)
const LLM_API_URL = process.env.LLM_API_URL || "http://localhost:3001/api/llm/stream";

/**
 * Stream LLM response for chat
 * This calls an external API endpoint that handles the actual LLM streaming
 */
export const streamLLM = action({
  args: {
    message: v.string(),
    notebookId: v.id("notebooks"),
    history: v.array(
      v.object({
        role: v.string(),
        content: v.string(),
      })
    ),
    model: v.optional(v.string()),
  },
  handler: async (_, args): Promise<string> => {
    const response = await fetch(LLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: args.message,
        notebookId: args.notebookId,
        history: args.history,
        model: args.model || LLM_MODELS.SMART,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${error}`);
    }

    // For now, return the full response
    // In production, this would use Server-Sent Events
    return await response.text();
  },
});

/**
 * Streaming response generator for SSE
 * This would be used in the HTTP action
 */
export async function* streamLLMResponse(
  message: string,
  history: Array<{ role: string; content: string }>,
  model: string = LLM_MODELS.SMART
): AsyncGenerator<string, void, unknown> {
  const response = await fetch(LLM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      history,
      model,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE data lines
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              yield parsed.content;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
