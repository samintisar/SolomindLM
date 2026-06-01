"use node";
/**
 * LLM wrapper for chat agent.
 *
 * Handles structured output generation with citations using TogetherAI.
 * Optimized for token efficiency and reliable structured output.
 */

import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import Together from "together-ai";
import type { ReferenceChunk } from "../../storage/ChatHistoryService";

import { uncachedLlmCall } from "../_shared/cachedLlm.js";
import { extractUniqueSortedCitationIndices } from "../_shared/citationExtract.js";
import { withLanguageInstruction } from "../_shared/languageInstruction.js";
import { mergeModelKwargs } from "../_shared/llm_factory.js";
import { buildGroundingPrompt, estimateTokens, isComplexQuery } from "./chat_llm_grounding.js";
import {
  buildNotebookChatInstructionBlock,
  CORE_SYSTEM_PROMPT,
  MINIMAL_FEW_SHOT,
  STRICT_GROUNDING_PREFIX,
} from "./chat_llm_prompts.js";
import {
  type ChatResponse,
  ChatResponseSchema,
  type LLMWrapperConfig,
  stripLeakedConfidenceFromMarkdown,
} from "./chat_llm_types.js";
import {
  expandListSubqueries,
  isListEnumerationQuery,
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
  /** Together AI SDK client for streaming with structured output */
  private togetherClient: Together;
  private readonly outputLanguage?: string;

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
    // Initialize Together AI SDK client for streaming with structured output
    this.togetherClient = new Together({
      apiKey: config.apiKey,
    });
    this.outputLanguage = config.outputLanguage;
  }

  /**
   * Generates a direct conversational response without RAG context.
   * Used when the deterministic router decides no document search is needed
   * (e.g. greetings, meta-questions about the app).
   */
  async generateDirectResponse(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    chatSettings?: {
      instructionMode: "default" | "learningGuide" | "custom";
      customInstructions?: string;
      responseLength: "default" | "longer" | "shorter";
    }
  ): Promise<string> {
    console.log("[ChatLLMWrapper] Generating direct response (no RAG)");
    let systemPrompt =
      "You are a helpful study assistant. Answer the user conversationally and concisely. " +
      "If they are asking about specific content from their documents, let them know you can search " +
      "for it if they rephrase their question.";
    if (chatSettings) {
      systemPrompt += buildNotebookChatInstructionBlock(chatSettings);
    }
    systemPrompt = withLanguageInstruction(systemPrompt, this.outputLanguage);
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
   *
   * Uses `uncachedLlmCall` (Together REST), not LangChain `invoke`.
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
   * Uses `uncachedLlmCall` (Together REST), not LangChain `invoke`.
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
      const stripped = text
        .replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, "")
        .trim();
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
   * Uses `uncachedLlmCall` (Together REST), not LangChain `invoke`.
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

    const isListQuery =
      /\b\d+\s+(\w+\s+)?(items?|patterns?|types?|categories?|methods?|techniques?|strategies?|principles?|rules?|steps?|stages?|phases?|elements?|factors?|components?|ways?|kinds?|forms?|approaches?|practices?|examples?|topics?|concepts?|ideas?|reasons?|benefits?|features?|characteristics?|properties?|aspects?|dimensions?|domains?|areas?|fields?|themes?|subjects?|questions?|problems?|challenges?|solutions?|answers?)\b/i.test(
        trimmed
      ) ||
      /\b(list|enumerate|name|every|each\s+of|how\s+many|count\s+(of|all)|complete\s+(list|set)|full\s+list)\b/i.test(
        trimmed
      );

    const listInstruction = isListQuery
      ? `

CRITICAL FOR LIST/ENUMERATION QUERIES: The user is asking for a COMPLETE list. Generate subqueries that will retrieve chunks from DIFFERENT PARTS of the document. Each subquery should target:
- Different sections or chapters (e.g., "introduction", "advanced topics")
- Different item categories (e.g., "basic patterns", "advanced patterns", "safety patterns")
- Different aspects (e.g., "definitions", "examples", "implementation")
- DO NOT just rephrase the same query 6 times — use DISTINCT search terms`
      : "";

    const prompt = `Break the student's question into 1–6 short declarative search strings for document retrieval (not questions). Each string should be self-contained for hybrid search. If the question compares multiple topics, include one string per topic.

IMPORTANT: For list/enumeration questions (e.g. "list all X", "what are the N Y"), generate diverse subqueries that target different aspects, subcategories, or sections of the requested items. Do NOT just rephrase the same concept — each subquery should aim to surface a different subset of items.${listInstruction}

Also optionally set "rerankQuery": a single English line that captures the full user intent for reranking (defaults to the user message if omitted).

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
      if (fromFast) {
        // Expand subqueries for list queries when the LLM returned too few
        if (isListEnumerationQuery(trimmed) && fromFast.subqueries.length < 4) {
          fromFast.subqueries = expandListSubqueries(trimmed, fromFast.subqueries);
          console.log(
            `[ChatLLMWrapper] Expanded list subqueries: ${fromFast.subqueries.length} total`,
            fromFast.subqueries
          );
        }
        return fromFast;
      }
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
    conversationHistory: Array<{ role: string; content: string }> = [],
    chatSettings?: {
      instructionMode: "default" | "learningGuide" | "custom";
      customInstructions?: string;
      responseLength: "default" | "longer" | "shorter";
    }
  ): Promise<ChatResponse> {
    console.log("[ChatLLMWrapper] Retrying with strict grounding");
    return this._generateStructuredResponse(
      chunks,
      userMessage,
      conversationHistory,
      true,
      chatSettings
    );
  }

  /**
   * Generates a structured response with citations via `withStructuredOutput` (JSON schema).
   *
   * @param chunks - Reference chunks to use as context
   * @param userMessage - The user's question
   * @param conversationHistory - Previous conversation turns for context
   * @returns Structured chat response with citations
   */
  async generateStructuredResponse(
    chunks: ReferenceChunk[],
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }> = [],
    chatSettings?: {
      instructionMode: "default" | "learningGuide" | "custom";
      customInstructions?: string;
      responseLength: "default" | "longer" | "shorter";
    }
  ): Promise<ChatResponse> {
    return this._generateStructuredResponse(
      chunks,
      userMessage,
      conversationHistory,
      false,
      chatSettings
    );
  }

  private async _generateStructuredResponse(
    chunks: ReferenceChunk[],
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    strictGrounding: boolean,
    chatSettings?: {
      instructionMode: "default" | "learningGuide" | "custom";
      customInstructions?: string;
      responseLength: "default" | "longer" | "shorter";
    }
  ): Promise<ChatResponse> {
    console.log("[ChatLLMWrapper] Generating structured response with citations (streaming)");

    const needsExamples = conversationHistory.length === 0 || isComplexQuery(userMessage);

    const today = new Date().toISOString().split("T")[0];
    const dateContext = `\nCurrent Date: ${today}`;

    const basePrompt = needsExamples
      ? `${MINIMAL_FEW_SHOT}\n\n${CORE_SYSTEM_PROMPT}${dateContext}`
      : `${CORE_SYSTEM_PROMPT}${dateContext}`;
    let systemPrompt = strictGrounding ? `${STRICT_GROUNDING_PREFIX}${basePrompt}` : basePrompt;

    // Append notebook chat instructions (lower priority than grounding/citations)
    if (chatSettings) {
      systemPrompt += buildNotebookChatInstructionBlock(chatSettings);
    }
    systemPrompt = withLanguageInstruction(systemPrompt, this.outputLanguage);

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

    // Use Together AI SDK with streaming for structured output
    // This avoids the hard timeout issue by streaming tokens incrementally
    try {
      const { z } = await import("zod");
      const jsonSchema = z.toJSONSchema(ChatResponseSchema);

      // Build messages in the format expected by Together AI
      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: groundedPrompt },
      ];

      console.log("[ChatLLMWrapper] Starting streaming request to Together AI...");

      // Create streaming request
      const stream = await this.togetherClient.chat.completions.create({
        model: this.smartLlmModelId,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "chat_response",
            schema: jsonSchema,
          },
        },
        temperature: 0.1,
        stream: true,
        max_tokens: 8192,
      });

      // Accumulate streaming chunks
      const chunks: string[] = [];
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
          chunks.push(token);
        }
      }

      const fullResponse = chunks.join("");
      console.log("[ChatLLMWrapper] Streaming complete, parsing JSON...");

      // Parse the accumulated JSON
      let parsedResponse: any;
      try {
        parsedResponse = JSON.parse(fullResponse);
      } catch (parseError) {
        console.warn("[ChatLLMWrapper] Failed to parse streaming JSON:", parseError);
        // Try to salvage partial JSON or raw text
        const salvaged = this.salvageResponse(fullResponse);
        if (salvaged) {
          return salvaged;
        }
        return {
          answer_markdown: "I encountered an error processing the response. Please try again.",
          confidence: "low",
        };
      }

      // Validate against schema
      const validated = ChatResponseSchema.safeParse(parsedResponse);

      if (!validated.success) {
        console.warn(
          "[ChatLLMWrapper] Structured output validation failed:",
          validated.error.issues
        );

        const salvaged = this.salvageResponse(parsedResponse);
        if (salvaged) {
          console.log("[ChatLLMWrapper] Successfully salvaged response after validation failure");
          return salvaged;
        }

        return {
          answer_markdown: "I encountered an error. Please rephrase your question or try again.",
          confidence: "low",
        };
      }

      console.log("[ChatLLMWrapper] Structured response generated successfully (via streaming)");
      const cleanedMarkdown = stripLeakedConfidenceFromMarkdown(
        validated.data.answer_markdown ?? ""
      );
      console.log(`[ChatLLMWrapper] Full response markdown: "${cleanedMarkdown}"`);

      const extractedCitations = this.extractCitationsFromMarkdown(cleanedMarkdown);
      console.log(
        `[ChatLLMWrapper] Citations: [${extractedCitations.join(", ")}], Confidence: ${validated.data.confidence}`
      );

      return {
        answer_markdown: cleanedMarkdown,
        confidence: validated.data.confidence ?? "low",
      } as ChatResponse;
    } catch (error) {
      console.error("[ChatLLMWrapper] Streaming structured output generation failed:", error);

      // Fallback to LangChain approach if streaming fails
      console.log("[ChatLLMWrapper] Falling back to LangChain non-streaming approach...");
      return this._generateStructuredResponseLangChain(
        chunks,
        userMessage,
        conversationHistory,
        strictGrounding,
        chatSettings
      );
    }
  }

  /** Fallback: Original LangChain-based non-streaming implementation */
  private async _generateStructuredResponseLangChain(
    chunks: ReferenceChunk[],
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    strictGrounding: boolean,
    chatSettings?: {
      instructionMode: "default" | "learningGuide" | "custom";
      customInstructions?: string;
      responseLength: "default" | "longer" | "shorter";
    }
  ): Promise<ChatResponse> {
    console.log("[ChatLLMWrapper] Using LangChain fallback (non-streaming)");

    const needsExamples = conversationHistory.length === 0 || isComplexQuery(userMessage);
    const today = new Date().toISOString().split("T")[0];
    const dateContext = `\nCurrent Date: ${today}`;

    const basePrompt = needsExamples
      ? `${MINIMAL_FEW_SHOT}\n\n${CORE_SYSTEM_PROMPT}${dateContext}`
      : `${CORE_SYSTEM_PROMPT}${dateContext}`;
    let systemPrompt = strictGrounding ? `${STRICT_GROUNDING_PREFIX}${basePrompt}` : basePrompt;

    if (chatSettings) {
      systemPrompt += buildNotebookChatInstructionBlock(chatSettings);
    }
    systemPrompt = withLanguageInstruction(systemPrompt, this.outputLanguage);

    const structuredLlm = (this.llm as any).withStructuredOutput(ChatResponseSchema, {
      name: "chat_response",
    });

    const groundedPrompt = buildGroundingPrompt(chunks, userMessage, conversationHistory);
    const messages = [new SystemMessage(systemPrompt), new HumanMessage(groundedPrompt)];
    try {
      const response: any = await structuredLlm.invoke(messages);
      const validated = ChatResponseSchema.safeParse(response);

      if (!validated.success) {
        const salvaged = this.salvageResponse(response);
        if (salvaged) return salvaged;
        return {
          answer_markdown: "I encountered an error. Please rephrase your question or try again.",
          confidence: "low",
        };
      }

      return {
        answer_markdown: stripLeakedConfidenceFromMarkdown(validated.data.answer_markdown ?? ""),
        confidence: validated.data.confidence ?? "low",
      } as ChatResponse;
    } catch (error) {
      console.error("[ChatLLMWrapper] LangChain fallback failed:", error);
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
        answer_markdown: stripLeakedConfidenceFromMarkdown(answerText),
        confidence,
      };
    } catch (error) {
      console.error("[ChatLLMWrapper] Salvage attempt failed:", error);
      return null;
    }
  }
}
