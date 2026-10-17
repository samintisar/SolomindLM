import type { AgentStageName } from "./types";

const STAGES = new Set<AgentStageName>([
  "retrieve",
  "plan",
  "hyde",
  "rerank",
  "select",
  "generate",
  "grounding",
  "followup",
  "map",
  "reduce",
  "parse",
  "tts",
]);

export function isAgentStageName(value: string): value is AgentStageName {
  return STAGES.has(value as AgentStageName);
}
