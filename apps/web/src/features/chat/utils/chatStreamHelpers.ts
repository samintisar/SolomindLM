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

export function computeRemoteGenerationBlocksSend(
  chatRemoteGenerating: boolean,
  messages: Array<{ role: string }>
): boolean {
  if (!chatRemoteGenerating) return false;
  const last = messages[messages.length - 1];
  return last?.role !== "assistant";
}
