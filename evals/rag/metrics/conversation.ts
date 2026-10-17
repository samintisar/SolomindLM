/**
 * Multi-turn chat measurements (info only). `history_token_share` says how much of the prompt
 * context the prior conversation takes; `history_mode` records which instruction mode ran. Only
 * learning guide mode keeps history for the answer (ChatAgent.streamRoutedResponse), so the share
 * is reported with that flag rather than scored as a failure.
 */
import type { EvalBaseline, EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import { metricResult } from "./metricResult";

type InstructionMode = "default" | "learningGuide" | "custom";

/** Same estimate as the other token metrics: about four characters per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The mode the artifact ran in, else the mode the fixture asked for, else default. */
function modeOf(fixture: EvalFixture, artifact: EvalRunArtifact): InstructionMode {
  return artifact.instructionMode ?? fixture.chatSettings?.instructionMode ?? "default";
}

export function historyTokenShare(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const historyTokens = (fixture.turns ?? []).reduce(
    (sum, turn) => sum + estimateTokens(turn.content),
    0
  );
  const chunkTokens = artifact.selectedChunks.reduce(
    (sum, chunk) => sum + estimateTokens(chunk.content),
    0
  );
  const total = historyTokens + chunkTokens;
  const share = total === 0 ? 0 : historyTokens / total;
  const mode = modeOf(fixture, artifact);
  return metricResult(
    "history_token_share",
    fixture,
    artifact,
    "info",
    share,
    `History ${historyTokens} tokens, selected chunks ${chunkTokens} tokens (${(share * 100).toFixed(1)}% history).`,
    {
      historyTokens,
      chunkTokens,
      mode,
      historyDiscardedByMode: mode !== "learningGuide",
    }
  );
}

export function historyMode(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const mode = modeOf(fixture, artifact);
  const keepsHistory = mode === "learningGuide";
  return metricResult(
    "history_mode",
    fixture,
    artifact,
    "info",
    keepsHistory ? 1 : 0,
    `Instruction mode ${mode}${keepsHistory ? " (prior turns kept)" : " (prior turns not used)"}.`,
    { mode, keepsHistory }
  );
}
