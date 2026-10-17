import { VALID_LANGUAGE_CODES } from "../../../convex/_agents/_shared/languageInstruction";
import { passageTextForModel } from "../../../convex/_agents/chat/passageContext";
import type { ChatAgentContext, ReferenceChunk } from "../../../convex/_agents/chat/types";
import { AVAILABLE_SMART_MODEL_IDS } from "../../../convex/_lib/resolveSmartModel";
import { inferSourceChannel } from "../metrics/sourceAware";
import type { CallCounters, ChunkSnapshot, EvalFixture, EvidenceChannel } from "../types";
import { runWithHarness } from "./harness";
import type { EvalRunnerOptions, EvalRunnerResult } from "./types";

// ─── Invoker interface ────────────────────────────────────────
// The eval runner cannot call Convex agents directly from a
// standalone script.  Instead, the host (e.g. an integration test
// or CLI harness) provides an invoker that wraps the real agent
// call and returns a structured result.

/** Settings production passes the agent outside ChatAgentContext (ChatAgentOptions). */
export interface EvalChatOptions {
  smartModel?: string;
  outputLanguage?: string;
}

export type ChatInvokeInput = ChatAgentContext & {
  sourcePolicy?: import("../types").SourcePolicyConfig;
  chatOptions?: EvalChatOptions;
};

export interface ChatAgentInvoker {
  invoke(context: ChatInvokeInput): Promise<{
    answer: string;
    citations: string[];
    subQueries: string[];
    failedSubQueries?: string[];
    preRerankChunks: ReferenceChunk[];
    postRerankChunks: ReferenceChunk[];
    selectedChunks: ReferenceChunk[];
    latencyMs: number;
    tokenUsage?: { prompt: number; completion: number; total: number };
    tokenUsageSource?: "provider" | "estimated";
    stageSpans?: import("../types").AgentStageSpan[];
    callCounters?: CallCounters;
    contextTokenBudget?: number;
    instructionMode?: "default" | "learningGuide" | "custom";
    sourcePolicy?: import("../types").SourcePolicyConfig;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────

function toChunkSnapshot(chunk: ReferenceChunk): ChunkSnapshot {
  return {
    id: chunk.id,
    sourceTitle: chunk.sourceTitle,
    sourceUrl: chunk.sourceUrl,
    content: chunk.content,
    contextText: passageTextForModel(chunk),
    similarity: chunk.similarity,
    rrfScore: chunk.rrfScore,
    vectorRank: chunk.vectorRank,
    keywordRank: chunk.keywordRank,
  };
}

/** Chat settings for a fixture. Notebook instructions make the mode custom, as in production. */
function fixtureChatSettings(fixture: EvalFixture): NonNullable<ChatAgentContext["chatSettings"]> {
  const instructions = fixture.chat?.instructions?.trim();
  if (instructions) {
    return {
      instructionMode: "custom",
      customInstructions: instructions,
      responseLength: "default",
    };
  }
  return {
    instructionMode: fixture.chatSettings?.instructionMode ?? "default",
    responseLength: "default",
  };
}

function validateFixture(fixture: EvalFixture): string[] {
  const errors: string[] = [];

  if (!fixture.id) {
    errors.push("Fixture missing id");
  }
  if (!fixture.question?.trim()) {
    errors.push("Fixture missing question");
  }
  if (!Array.isArray(fixture.expectedItems)) {
    errors.push("expectedItems must be an array");
  } else if (fixture.expectedItems.length === 0 && !fixture.expectedAnswer?.trim()) {
    errors.push("Fixture must have at least one expectedItem or a non-empty expectedAnswer");
  }

  for (const turn of fixture.turns ?? []) {
    if (turn.role !== "user" && turn.role !== "assistant") {
      errors.push(`turns must have role "user" or "assistant", got "${String(turn.role)}"`);
    }
    if (!turn.content?.trim()) {
      errors.push("turns must have non-empty content");
    }
  }

  const chat = fixture.chat;
  if (chat?.instructions?.trim() && fixture.chatSettings?.instructionMode === "learningGuide") {
    errors.push(
      "chat.instructions cannot be combined with chatSettings.instructionMode learningGuide"
    );
  }
  if (
    chat?.smartModel &&
    !(AVAILABLE_SMART_MODEL_IDS as readonly string[]).includes(chat.smartModel)
  ) {
    errors.push(`chat.smartModel "${chat.smartModel}" is not a listed model`);
  }
  if (chat?.outputLanguage && !VALID_LANGUAGE_CODES.includes(chat.outputLanguage)) {
    errors.push(`chat.outputLanguage "${chat.outputLanguage}" is not a supported language code`);
  }

  return errors;
}

// ─── Runner ───────────────────────────────────────────────────

export async function runChatEval(
  options: EvalRunnerOptions,
  invoker?: ChatAgentInvoker
): Promise<EvalRunnerResult> {
  const { fixture } = options;
  return runWithHarness(options, invoker, {
    runner: "chat",
    validate: validateFixture,
    missingInvokerMessage:
      "No ChatAgentInvoker provided for real run. " +
      "Use --dry-run to validate fixtures, or provide an invoker to run against real agents.",
    failurePrefix: "Chat agent invocation failed",
    async invoke(chat, configHash) {
      // userId is a sentinel placeholder. The Convex invoker
      // (`evals/rag/runners/convexChatInvoker.ts`) does NOT forward it, and the
      // Convex eval action derives identity from the notebook owner server-side.
      // Field exists only to satisfy the shared `ChatAgentContext` shape; if a
      // future invoker starts using it, that invoker must derive a real userId
      // rather than relying on this string.
      // Prior turns, then the question as the final user turn (production history ends with the
      // current message too). Learning guide mode is the only one that reads the history.
      const result = await chat.invoke({
        userId: "__eval_unused__",
        noteId: fixture.notebookId ?? "",
        conversationHistory: [
          ...(fixture.turns ?? []),
          { role: "user", content: fixture.question },
        ],
        documentIds: fixture.documentIds,
        sourcePolicy: fixture.sourcePolicy,
        chatSettings: fixtureChatSettings(fixture),
        chatOptions: {
          smartModel: fixture.chat?.smartModel,
          outputLanguage: fixture.chat?.outputLanguage,
        },
      });

      // Build source evidence summary from selected chunks
      const sourceEvidenceMap = new Map<
        EvidenceChannel,
        { sourceCount: number; topDomains: string[] }
      >();
      for (const chunk of result.selectedChunks) {
        const channel = inferSourceChannel(chunk.sourceUrl);
        const existing = sourceEvidenceMap.get(channel) ?? { sourceCount: 0, topDomains: [] };
        existing.sourceCount++;
        if (chunk.sourceUrl) {
          try {
            const domain = new URL(chunk.sourceUrl).hostname;
            if (!existing.topDomains.includes(domain)) {
              existing.topDomains.push(domain);
            }
          } catch {
            // Invalid URL, skip
          }
        }
        sourceEvidenceMap.set(channel, existing);
      }
      const sourceEvidence = Array.from(sourceEvidenceMap.entries()).map(([channel, data]) => ({
        channel,
        sourceCount: data.sourceCount,
        topDomains: data.topDomains.slice(0, 5),
      }));

      return {
        caseId: fixture.id,
        runner: "chat",
        configHash,
        answer: result.answer,
        citations: result.citations,
        preRerankChunks: result.preRerankChunks.map(toChunkSnapshot),
        postRerankChunks: result.postRerankChunks.map(toChunkSnapshot),
        selectedChunks: result.selectedChunks.map(toChunkSnapshot),
        subQueries: result.subQueries,
        failedSubQueries: result.failedSubQueries,
        latencyMs: result.latencyMs,
        tokenUsage: result.tokenUsage,
        tokenUsageSource: result.tokenUsageSource ?? "estimated",
        stageSpans: result.stageSpans,
        callCounters: result.callCounters,
        contextTokenBudget: result.contextTokenBudget,
        instructionMode: result.instructionMode,
        sourcePolicy: result.sourcePolicy,
        sourceEvidence,
        timestamp: new Date().toISOString(),
      };
    },
  });
}
