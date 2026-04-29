/**
 * Deterministic chat route selection (no LLM). Clarify vs direct vs retrieve.
 */

export type ChatRoute =
  | { type: "direct" }
  | { type: "clarify"; question: string }
  | { type: "retrieve" };

type ChatHistoryTurn = {
  role: string;
  content: string;
  metadata?: unknown;
};

const GREETING_RE =
  /^\s*(hi|hello|hey|good\s+(morning|afternoon|evening)|thanks|thank\s+you|thx|bye|goodbye|ok|okay|cool|nice)\b[!?.\s]*$/i;

const META_APP_RE =
  /\b(how\s+do\s+i\s+use|how\s+does\s+this\s+app|what\s+is\s+solomind|solomind\s+lm|upload\s+a\s+file|how\s+to\s+upload)\b/i;

function getAwaitingGuidedResponse(metadata: unknown): boolean | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const guidedLearning = (metadata as { guidedLearning?: unknown }).guidedLearning;
  if (!guidedLearning || typeof guidedLearning !== "object") return undefined;
  const awaitingUserResponse = (guidedLearning as { awaitingUserResponse?: unknown })
    .awaitingUserResponse;
  return typeof awaitingUserResponse === "boolean" ? awaitingUserResponse : undefined;
}

/**
 * Check whether the last assistant turn is explicitly waiting for a guided answer.
 * Falls back to the legacy punctuation heuristic for older messages without metadata.
 */
function lastAssistantAwaitingGuidedResponse(history: ChatHistoryTurn[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") {
      const explicitState = getAwaitingGuidedResponse(history[i].metadata);
      if (explicitState !== undefined) {
        return explicitState;
      }
      const text = history[i].content.trimEnd();
      return text.endsWith("?");
    }
  }
  return false;
}

/**
 * Check if the user message looks like a conversational follow-up (answering a question)
 * rather than a new substantive query.
 */
function isConversationalFollowUp(trimmed: string): boolean {
  // Short, non-question messages are likely follow-up answers to Socratic questions
  if (trimmed.length > 150) return false;
  // If it starts with a question word, it's a new query
  if (/^(what|who|where|when|why|how|which|define|explain|compare|describe|list)\b/i.test(trimmed))
    return false;
  return true;
}

/**
 * Route the latest user message. `historyBudgeted` is prior turns only (current message separate).
 */
export function routeChatMessage(
  userMessage: string,
  historyBudgeted: ChatHistoryTurn[],
  chatSettings?: {
    instructionMode?: "default" | "learningGuide" | "custom";
  }
): ChatRoute {
  const trimmed = userMessage.trim();
  if (trimmed.length === 0) {
    return {
      type: "clarify",
      question: "What would you like to know about your materials?",
    };
  }

  if (trimmed.length <= 2) {
    return {
      type: "clarify",
      question: "Could you say a bit more about what you want to study or find in your documents?",
    };
  }

  if (GREETING_RE.test(trimmed) && trimmed.length < 40) {
    return { type: "direct" };
  }

  if (META_APP_RE.test(trimmed) && trimmed.length < 120) {
    return { type: "direct" };
  }

  // In learning guide mode, if the assistant last asked a Socratic question and the user
  // is answering it conversationally, skip RAG retrieval — the context is already in history.
  if (
    chatSettings?.instructionMode === "learningGuide" &&
    lastAssistantAwaitingGuidedResponse(historyBudgeted) &&
    isConversationalFollowUp(trimmed)
  ) {
    return { type: "direct" };
  }

  return { type: "retrieve" };
}
