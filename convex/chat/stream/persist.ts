"use node";

import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { sleepMs } from "./streamBuffer";

interface AgentTrace {
  toolCalls: Array<{
    tool: string;
    query: string;
    status: "searching" | "done";
    resultCount?: number;
  }>;
  grounding: Array<{
    passed: boolean;
    issues: string[];
    message: string;
    soft?: boolean;
  }>;
  phases: Array<{ status: string; message: string }>;
  clarification?: string;
}

export async function persistAssistantMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  conversationId: Id<"conversations">,
  streamId: string,
  fullResponse: string,
  references: unknown[],
  hasError: boolean,
  agentTrace: AgentTrace,
  mergedChatSettings: {
    instructionMode: "default" | "learningGuide" | "custom";
    customInstructions?: string;
    responseLength: "default" | "longer" | "shorter";
  },
  externalSources: Array<{ title: string; url: string; snippet: string; sourceType: string; score?: number }>,
  chatStreamLog?: { info: (key: string, meta?: Record<string, unknown>) => void; warn: (key: string, meta?: Record<string, unknown>) => void; error: (key: string, err?: unknown) => void },
  isGenerationActive?: () => Promise<boolean>
): Promise<void> {
  const { messages: existingMessages } = await ctx.runQuery(
    internal.chat.index.getMessagesInternal,
    {
      conversationId,
      limit: 1,
    }
  );

  if (isGenerationActive) {
    const generationStillActive = await isGenerationActive();
    if (!generationStillActive) {
      chatStreamLog?.info("assistant_persist_skipped", {
        streamId,
        detail: "generation_cancelled",
      });
      return;
    }
  }

  const clarificationBody =
    agentTrace.clarification?.trim() &&
    `**Could you clarify?**\n\n${agentTrace.clarification.trim()}`;
  const contentToPersist = fullResponse.trim() || clarificationBody || "";

  if (!hasError && contentToPersist) {
    recordPhase(agentTrace, "completed", "Response complete");
  }

  const metadataPayload = {
    guidedLearning: {
      awaitingUserResponse:
        mergedChatSettings.instructionMode === "learningGuide" &&
        Boolean(contentToPersist) &&
        !hasError &&
        !agentTrace.clarification,
    },
    agentTrace: {
      toolCalls: agentTrace.toolCalls,
      grounding: agentTrace.grounding,
      phases: agentTrace.phases.slice(-30),
      clarification: agentTrace.clarification,
    },
    hadStreamError: hasError || undefined,
    externalSources: externalSources.length > 0 ? externalSources : undefined,
  };

  if (existingMessages.length === 0) {
    chatStreamLog?.warn("conversation_cleared_during_generation", {
      detail: "skip_assistant_persist",
    });
    return;
  }

  const refsToStore = fullResponse.trim() ? references : undefined;
  const errorSuffix = "\n\n_⚠️ This response ended early due to an error. Please try again._";
  const contentFinal = hasError
    ? contentToPersist
      ? `${contentToPersist}${errorSuffix}`
      : "Something went wrong while generating a response. Please try again."
    : contentToPersist;

  if (contentFinal) {
    let persisted = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
          conversationId,
          streamId,
          content: contentFinal,
          references: refsToStore,
          metadata: metadataPayload,
        });
        persisted = true;
        void res;
        break;
      } catch (e) {
        chatStreamLog?.warn("persist_assistant_retry", {
          attempt: attempt + 1,
          error: e instanceof Error ? e.message : String(e),
        });
        if (attempt < 3) await sleepMs(150 * (attempt + 1));
      }
    }
    if (!persisted) {
      try {
        await ctx.runMutation(internal.chat.index.persistAssistantFromStream, {
          conversationId,
          streamId,
          content:
            "**We couldn't save this reply.**\n\nPlease try sending your message again. Your answer may have appeared above but might not be kept in history.",
          metadata: {
            ...metadataPayload,
            tombstone: true,
            persistFailed: true,
          },
        });
      } catch (e2) {
        chatStreamLog?.error("tombstone_persist_failed", e2);
      }
    }
  }
}

function recordPhase(
  agentTrace: AgentTrace,
  status: string,
  message: string
): void {
  const last = agentTrace.phases[agentTrace.phases.length - 1];
  if (last && last.status === status && last.message === message) {
    return;
  }
  agentTrace.phases.push({ status, message });
}
