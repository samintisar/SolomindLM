/**
 * Deterministic chat route selection (no LLM). Clarify vs direct vs retrieve.
 */

export type ChatRoute =
  | { type: "direct" }
  | { type: "clarify"; question: string }
  | { type: "retrieve" };

const GREETING_RE =
  /^\s*(hi|hello|hey|good\s+(morning|afternoon|evening)|thanks|thank\s+you|thx|bye|goodbye|ok|okay|cool|nice)\b[!?.\s]*$/i;

const META_APP_RE =
  /\b(how\s+do\s+i\s+use|how\s+does\s+this\s+app|what\s+is\s+solomind|solomind\s+lm|upload\s+a\s+file|how\s+to\s+upload)\b/i;

/**
 * Short questions like "What is ARMA?" are valid retrieval targets; don't treat them as vague.
 */
function looksLikeTargetedQuestion(trimmed: string): boolean {
  return (
    /^(what|who|where|when|why|how)\s+(is|are|was|were|do|does|did|can|could|should|would)\s+\S+/i.test(
      trimmed
    ) ||
    /^define\s+\S+/i.test(trimmed) ||
    /^explain\s+(the\s+)?\S+/i.test(trimmed)
  );
}

/**
 * Route the latest user message. `historyBudgeted` is prior turns only (current message separate).
 */
export function routeChatMessage(
  userMessage: string,
  _historyBudgeted: Array<{ role: string; content: string }>
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

  // Very short vague question — ask for scope (skip "What is X?" / "Define Y?" style)
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (
    wordCount <= 3 &&
    trimmed.length < 40 &&
    trimmed.includes("?") &&
    !looksLikeTargetedQuestion(trimmed)
  ) {
    return {
      type: "clarify",
      question:
        "Your question is quite short. Which topic, document, or concept should I focus on in your notebook?",
    };
  }

  return { type: "retrieve" };
}
