import type { AgentStageName, AgentStageSpan } from "../_agents/_shared/stageSpans";
import type { TokenUsage, TokenUsageSource } from "../_agents/_shared/usageAggregate";

const AGENT_STAGE_NAMES: ReadonlySet<AgentStageName> = new Set([
  "retrieve",
  "rerank",
  "select",
  "map",
  "reduce",
  "parse",
  "tts",
]);

type StudioTelemetryCarrier = {
  tokenUsage?: unknown;
  tokenUsageSource?: unknown;
  stageSpans?: unknown;
  metadata?: {
    tokenUsage?: unknown;
    tokenUsageSource?: unknown;
    stageSpans?: unknown;
  } | null;
};

export function pickStudioEvalTelemetry(row: StudioTelemetryCarrier): {
  tokenUsage?: TokenUsage;
  tokenUsageSource?: TokenUsageSource;
  stageSpans?: AgentStageSpan[];
} {
  const tokenUsage = parseTokenUsage(row.tokenUsage) ?? parseTokenUsage(row.metadata?.tokenUsage);
  const tokenUsageSource =
    parseTokenUsageSource(row.tokenUsageSource) ??
    parseTokenUsageSource(row.metadata?.tokenUsageSource);
  const stageSpans = parseStageSpans(row.stageSpans) ?? parseStageSpans(row.metadata?.stageSpans);

  return {
    ...(tokenUsage !== undefined ? { tokenUsage } : {}),
    ...(tokenUsageSource !== undefined ? { tokenUsageSource } : {}),
    ...(stageSpans !== undefined ? { stageSpans } : {}),
  };
}

function parseTokenUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const prompt = value.prompt;
  const completion = value.completion;
  const total = value.total;
  if (typeof prompt !== "number" || typeof completion !== "number" || typeof total !== "number") {
    return undefined;
  }
  return { prompt, completion, total };
}

function parseTokenUsageSource(value: unknown): TokenUsageSource | undefined {
  return value === "provider" || value === "estimated" ? value : undefined;
}

function parseStageSpans(value: unknown): AgentStageSpan[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const stageSpans = value.flatMap((span) => {
    const parsed = parseStageSpan(span);
    return parsed === undefined ? [] : [parsed];
  });
  return stageSpans.length > 0 ? stageSpans : undefined;
}

function parseStageSpan(value: unknown): AgentStageSpan | undefined {
  if (!isRecord(value)) return undefined;
  const { stage, latencyMs } = value;
  if (!isAgentStageName(stage) || typeof latencyMs !== "number") {
    return undefined;
  }
  const tokenUsage = parseTokenUsage(value.tokenUsage);
  return tokenUsage === undefined ? { stage, latencyMs } : { stage, latencyMs, tokenUsage };
}

function isAgentStageName(value: unknown): value is AgentStageName {
  return typeof value === "string" && AGENT_STAGE_NAMES.has(value as AgentStageName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
