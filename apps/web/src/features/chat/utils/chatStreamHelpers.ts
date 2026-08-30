import type { ChatActivityPhase } from "@/shared/types/index";

export function researchProgressToStreamingActivity(progress: {
  phase: string;
  subQuestionId?: string;
  sourcesFound?: number;
}): { phase: ChatActivityPhase; detail: string } {
  const n = progress.sourcesFound ?? 0;
  if (progress.phase === "writing") {
    return { phase: "writing", detail: "Synthesizing research report…" };
  }
  if (progress.phase === "retrieving_notebook") {
    const found =
      n > 0
        ? `Notebook search · ${n} chunk${n === 1 ? "" : "s"} found`
        : "Searching your notebook…";
    return { phase: "retrieving", detail: found };
  }
  return {
    phase: "thinking",
    detail: progress.phase.replace(/_/g, " "),
  };
}

/** Only render messages for the explicitly selected thread (never the notebook primary fallback). */
export function resolveConversationMessages<T>(
  activeConversationId: string | null,
  chatBundle: { messages: T[] } | undefined
): T[] {
  if (!activeConversationId) return [];
  if (!chatBundle) return [];
  return chatBundle.messages;
}

/** Ignore stream callbacks after the user switches to another conversation. */
export function isStreamStillRelevant(
  streamConversationId: string | null,
  activeConversationId: string | null
): boolean {
  if (streamConversationId === activeConversationId) return true;
  // Mutation resolved the thread before React selected it — keep applying tokens.
  if (streamConversationId != null && activeConversationId == null) return true;
  return false;
}

/**
 * Abort the HTTP stream only when the user actually switches threads.
 * Auto-selecting a conversation after send (null → id) must not kill the in-flight fetch.
 */
export function shouldResetStreamOnConversationChange(
  streamOwnerConversationId: string | null,
  nextActiveConversationId: string | null
): boolean {
  if (streamOwnerConversationId == null) return false;
  return streamOwnerConversationId !== nextActiveConversationId;
}

export function computeRemoteGenerationBlocksSend(
  chatRemoteGenerating: boolean,
  messages: Array<{ role: string }>
): boolean {
  if (!chatRemoteGenerating) return false;
  const last = messages[messages.length - 1];
  return last?.role !== "assistant";
}
