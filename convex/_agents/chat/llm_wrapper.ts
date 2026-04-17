"use node";
/**
 * LLM wrapper for chat agent.
 *
 * Handles structured output generation with citations using TogetherAI.
 * Optimized for token efficiency and reliable structured output.
 */

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import { createLangSmithRunConfig } from "../_shared/index.js";
import { uncachedLlmCall } from "../_shared/cachedLlm.js";
import { mergeModelKwargs } from "../_shared/llm_factory.js";
import { extractUniqueSortedCitationIndices } from "../_shared/citationExtract.js";
import { buildGroundingPrompt, estimateTokens, isComplexQuery } from "./chat_llm_grounding.js";
import {
  CORE_SYSTEM_PROMPT,
  MINIMAL_FEW_SHOT,
  STRICT_GROUNDING_PREFIX,
} from "./chat_llm_prompts.js";
import { ChatResponseSchema, type ChatResponse, type LLMWrapperConfig } from "./chat_llm_types.js";
import {
  parseRetrievalSubqueriesFromLlmContent,
  trivialRetrievalSubqueryMessage,
} from "./chat_retrieval_subqueries.js";

export type { ChatResponse, LLMWrapperConfig } from "./chat_llm_types.js";
export { ChatResponseSchema } from "./chat_llm_types.js";

/**
 * Handles LLM response generation with structured output and citations.
 */
export class ChatLLMWrapper {
  private llm: ChatTogetherAI;
  private fastLlm: ChatTogetherAI;
  /** Together model id for uncached follow-up calls (reasoning disabled). */
  private readonly fastLlmModelId: string;
  /** Primary generation model — used as fallback when fast model returns repeated 503s, etc. */
  private readonly smartLlmModelId: string;
  private tokenBudget: number = 7000; // Reserve tokens for generation

  constructor(config: LLMWrapperConfig) {
    // Smart vs fast: `mergeModelKwargs` — GPT-OSS uses reasoning_effort; Qwen-style uses chat_template thinking.
    this.llm = new ChatTogetherAI({
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature ?? 0.1,
      modelKwargs: mergeModelKwargs(config.model, "smart"),
    });
    this.fastLlm = config.fastModel
      ? new ChatTogetherAI({
          apiKey: config.fastApiKey ?? config.apiKey,
          model: config.fastModel,
          temperature: 0.1,
          modelKwargs: mergeModelKwargs(config.fastModel, "fast"),
        })
      : this.llm;
    this.fastLlmModelId = config.fastModel ?? config.model;
    this.smartLlmModelId = config.model;
  }

  /**
   * Generates a direct conversational response without RAG context.
   * Used when the deterministic router decides no document search is needed
   * (e.g. greetings, meta-questions about the app).
   */
  async generateDirectResponse(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<string> {
    console.log("[ChatLLMWrapper] Generating direct response (no RAG)");
    const systemPrompt =
      "You are a helpful study assistant. Answer the user conversationally and concisely. " +
      "If they are asking about specific content from their documents, let them know you can search " +
      "for it if they rephrase their question.";
    const messages = [
      new SystemMessage(systemPrompt),
      ...conversationHistory
        .slice(-4)
        .map((t) => (t.role === "user" ? new HumanMessage(t.content) : new AIMessage(t.content))),
      new HumanMessage(userMessage),
    ];
    try {
      const response = await this.fastLlm.invoke(messages);
      return typeof response.content === "string"
        ? response.content.trim()
        : String(response.content).trim();
    } catch (error) {
      console.warn("[ChatLLMWrapper] Direct response failed:", error);
      return "I'm here to help! Ask me anything about your study materials.";
    }
  }

  /**
   * Generates a hypothetical document paragraph for HyDE retrieval (uses the smart model).
   * The caller typically embeds this together with the declarative search query so
   * explicit keywords stay represented while HyDE improves semantic density.
   */
  async generateHypotheticalDocument(query: string): Promise<string> {
    console.log("[ChatLLMWrapper] Generating hypothetical document for HyDE");
    const prompt = `Write a short, factual paragraph (2–5 sentences) that would directly address this information need if it appeared in a textbook or study note. Write as plain statements of fact, not as dialogue or Q&A.

Coverage rules (for retrieval — follow even if you are unsure of fine details):
- If the question compares or contrasts multiple methods, concepts, named entities, cases, or time periods, give EACH distinct subject at least one clear sentence. Do not let the first or most familiar subject consume the whole paragraph or leave other named subjects out.
- If the question asks how A relates to B (difference, similarity, tradeoff), describe both A and B (or every side listed), not only one.
- Include important proper nouns and technical terms from the question using normal spacing between words.

Question: ${query}`;
    try {
      const response = await uncachedLlmCall({
        model: this.smartLlmModelId,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        maxTokens: 220,
        reasoningEnabled: false,
        toolChoice: "none",
      });
      const text = response.content.trim();
      console.log("[ChatLLMWrapper] HyDE document:", text.slice(0, 200));
      return text || query;
    } catch (error) {
      console.warn("[ChatLLMWrapper] HyDE generation failed, falling back to raw query:", error);
      return query;
    }
  }

  /**
   * Generates 2-3 follow-up question suggestions for a study session.
   */
  async generateFollowUpQuestions(userMessage: string, answer: string): Promise<string[]> {
    console.log("[ChatLLMWrapper] Generating follow-up questions");
    const truncatedAnswer = answer.length > 600 ? answer.slice(0, 600) + "..." : answer;
    const prompt = `You are helping a student study. Based on this Q&A, suggest 2-3 short follow-up questions the student might naturally ask next.\n\nQuestion: ${userMessage}\nAnswer: ${truncatedAnswer}\n\nReturn ONLY a JSON array of strings, e.g. ["Question 1?", "Question 2?", "Question 3?"]`;
    try {
      const response = await uncachedLlmCall({
        model: this.fastLlmModelId,
        messages: [
          {
            role: "system",
            content:
              "Reply with ONLY a JSON array of 2-3 short question strings. No markdown, no tools, and no text before or after the array.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.35,
        maxTokens: 320,
        reasoningEnabled: false,
        toolChoice: "none",
      });
      const text = response.content.trim();
      // Strip Qwen-style <redacted_thinking>...</redacted_thinking> reasoning blocks before parsing
      const stripped = text.replace(/<redacted_thinking>[\s\S]*?<\/think>/gi, "").trim();
      const match = stripped.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 3).map(String).filter(Boolean);
        }
      }
      return [];
    } catch (error) {
      console.warn("[ChatLLMWrapper] Follow-up question generation failed:", error);
      return [];
    }
  }

  /**
   * One-shot decomposition for parallel retrieval. No clarification field — router owns clarify path.
   * On failure returns a single subquery = user message.
   */
  async generateRetrievalSubqueries(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<{ subqueries: string[]; rerankQuery?: string }> {
    const fallback = { subqueries: [userMessage.trim() || "study material"] };
    const trimmed = userMessage.trim();
    if (!trimmed) return fallback;

    if (trivialRetrievalSubqueryMessage(trimmed)) {
      console.log("[ChatLLMWrapper] Skipping subquery decomposition (single-intent query)");
      return { subqueries: [trimmed] };
    }

    const historySnippet = conversationHistory
      .slice(-4)
      .map((t) => `${t.role}: ${t.content.slice(0, 400)}`)
      .join("\n");

    const prompt = `Break the student's question into 1–4 short declarative search strings for document retrieval (not questions). Each string should be self-contained for hybrid search. If the question compares multiple topics, include one string per topic. Also optionally set "rerankQuery": a single English line that captures the full user intent for reranking (defaults to the user message if omitted).

User question: ${trimmed}

Recent conversation (context):
${historySnippet || "(none)"}

Reply with ONLY valid JSON: {"subqueries": string[], "rerankQuery"?: string}`;

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      {
        role: "system",
        content:
          'Reply with ONLY a JSON object: {"subqueries": string[], "rerankQuery"?: string}. No markdown fences, no tools, no extra text.',
      },
      { role: "user", content: prompt },
    ];

    const callModel = async (modelId: string) => {
      const response = await uncachedLlmCall({
        model: modelId,
        messages,
        temperature: 0.1,
        maxTokens: 500,
        reasoningEnabled: false,
        toolChoice: "none",
      });
      return parseRetrievalSubqueriesFromLlmContent(response.content);
    };

    try {
      const fromFast = await callModel(this.fastLlmModelId);
      if (fromFast) return fromFast;
      return fallback;
    } catch (e) {
      console.warn("[ChatLLMWrapper] Retrieval subquery decomposition failed (fast model):", e);
      if (this.smartLlmModelId !== this.fastLlmModelId) {
        try {
          console.log("[ChatLLMWrapper] Retrying subquery decomposition with smart model");
          const fromSmart = await callModel(this.smartLlmModelId);
          if (fromSmart) return fromSmart;
        } catch (e2) {
          console.warn(
            "[ChatLLMWrapper] Retrieval subquery decomposition failed (smart model):",
            e2
          );
        }
      }
      return fallback;
    }
  }

  /**
   * Re-generates a response with stricter grounding constraints after a validation failure.
   */
  async generateWithStrictGrounding(
    chunks: ReferenceChunk[],
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<ChatResponse> {
    console.log("[ChatLLMWrapper] Retrying with strict grounding");
    return this._generateStructuredResponse(chunks, userMessage, conversationHistory, true);
  }

  /**
   * Generates a structured response with citations using tool calling.
   *
   * @param chunks - Reference chunks to use as context
   * @param userMessage - The user's question
   * @param conversationHistory - Previous conversation turns for context
   * @returns Structured chat response with citations
   */
  async generateStructuredResponse(
    chunks: ReferenceChunk[],
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<ChatResponse> {
    return this._generateStructuredResponse(chunks, userMessage, conversationHistory, false);
  }

  private async _generateStructuredResponse(
    chunks: ReferenceChunk[],
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    strictGrounding: boolean
  ): Promise<ChatResponse> {
    console.log("[ChatLLMWrapper] Generating structured response with citations");

    const needsExamples = conversationHistory.length === 0 || isComplexQuery(userMessage);

    const today = new Date().toISOString().split("T")[0];
    const dateContext = `\nCurrent Date: ${today}`;

    const basePrompt = needsExamples
      ? `${MINIMAL_FEW_SHOT}\n\n${CORE_SYSTEM_PROMPT}${dateContext}`
      : `${CORE_SYSTEM_PROMPT}${dateContext}`;
    const systemPrompt = strictGrounding ? `${STRICT_GROUNDING_PREFIX}${basePrompt}` : basePrompt;

    const structuredLlm = (this.llm as any).withStructuredOutput(ChatResponseSchema, {
      name: "chat_response",
    });

    const groundedPrompt = buildGroundingPrompt(chunks, userMessage, conversationHistory);

    console.log(
      "[ChatLLMWrapper] Full grounded prompt (first 2000 chars):",
      groundedPrompt.slice(0, 2000)
    );

    const systemTokens = estimateTokens(systemPrompt);
    const userTokens = estimateTokens(groundedPrompt);
    const totalTokens = systemTokens + userTokens;

    console.log(
      `[ChatLLMWrapper] Token usage: system=${systemTokens}, user=${userTokens}, total=${totalTokens}`
    );

    if (totalTokens > this.tokenBudget) {
      console.warn(
        `[ChatLLMWrapper] High token usage (${totalTokens}/${this.tokenBudget}). Consider reducing chunk count.`
      );
    }

    const messages = [new SystemMessage(systemPrompt), new HumanMessage(groundedPrompt)];
    const traceConfig = createLangSmithRunConfig({
      runName: "ChatAgentStructuredResponse",
      tags: ["agent", "chat"],
      metadata: {
        chunksCount: chunks.length,
        conversationHistoryCount: conversationHistory.length,
      },
    });

    try {
      const response: any = await structuredLlm.invoke(messages, traceConfig);
      const validated = ChatResponseSchema.safeParse(response);

      if (!validated.success) {
        console.warn(
          "[ChatLLMWrapper] Structured output validation failed:",
          validated.error.issues
        );

        const salvaged = this.salvageResponse(response);
        if (salvaged) {
          console.log("[ChatLLMWrapper] Successfully salvaged response after validation failure");
          return salvaged;
        }

        return {
          answer_markdown: "I encountered an error. Please rephrase your question or try again.",
          confidence: "low",
        };
      }

      console.log("[ChatLLMWrapper] Structured response generated successfully");
      console.log(`[ChatLLMWrapper] Full response markdown: "${validated.data.answer_markdown}"`);

      const extractedCitations = this.extractCitationsFromMarkdown(validated.data.answer_markdown);
      console.log(
        `[ChatLLMWrapper] Citations: [${extractedCitations.join(", ")}], Confidence: ${validated.data.confidence}`
      );

      return {
        answer_markdown: validated.data.answer_markdown ?? "",
        confidence: validated.data.confidence ?? "low",
      } as ChatResponse;
    } catch (error) {
      console.error("[ChatLLMWrapper] Structured output generation failed:", error);
      return {
        answer_markdown:
          "I apologize, but I encountered an error generating a response. Please try again.",
        confidence: "low",
      };
    }
  }

  private extractCitationsFromMarkdown(text: string): number[] {
    return extractUniqueSortedCitationIndices(text);
  }

  private salvageResponse(response: any): ChatResponse | null {
    try {
      let answerText = "";
      if (typeof response === "string") {
        answerText = response;
      } else if (response?.answer_markdown) {
        answerText = String(response.answer_markdown);
      } else if (response?.answer) {
        answerText = String(response.answer);
      } else {
        return null;
      }

      const citedIndices = this.extractCitationsFromMarkdown(answerText);

      const hasHedging = /\b(probably|might|maybe|perhaps|possibly|could be|it seems)\b/i.test(
        answerText
      );
      const hasMissingInfo =
        /don't have information|not covered|doesn't (explain|discuss|address)/i.test(answerText);

      const confidence =
        citedIndices.length >= 3 && !hasHedging
          ? "high"
          : citedIndices.length >= 1 && !hasMissingInfo
            ? "medium"
            : "low";

      return {
        answer_markdown: answerText,
        confidence,
      };
    } catch (error) {
      console.error("[ChatLLMWrapper] Salvage attempt failed:", error);
      return null;
    }
  }
}
