import type { AgentStageSpan } from "./stageSpans";
import { addTokenUsage, type TokenUsage, type TokenUsageSource } from "./usageAggregate";

export type StudioJobTelemetrySnapshot = {
  tokenUsage?: TokenUsage;
  tokenUsageSource?: TokenUsageSource;
  stageSpans?: AgentStageSpan[];
};

type MapResultLike = {
  processingTimeMs?: number;
  tokenUsage?: TokenUsage;
};

function parseTokenUsage(value: unknown): TokenUsage | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const prompt = record.prompt;
  const completion = record.completion;
  const total = record.total;
  if (
    typeof prompt !== "number" ||
    typeof completion !== "number" ||
    typeof total !== "number" ||
    total <= 0
  ) {
    return undefined;
  }
  return { prompt, completion, total };
}

function parseMapResult(raw: unknown): MapResultLike {
  if (typeof raw === "string") {
    try {
      return parseMapResult(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const processingTimeMs =
    typeof record.processingTimeMs === "number" ? record.processingTimeMs : undefined;
  return {
    ...(processingTimeMs !== undefined ? { processingTimeMs } : {}),
    ...(parseTokenUsage(record.tokenUsage) !== undefined
      ? { tokenUsage: parseTokenUsage(record.tokenUsage) }
      : {}),
  };
}

function withOptionalUsage(
  span: { stage: AgentStageSpan["stage"]; latencyMs: number },
  usage?: TokenUsage
): AgentStageSpan {
  return usage !== undefined ? { ...span, tokenUsage: usage } : span;
}

export function aggregateStudioJobTelemetry(input: {
  mapResults?: unknown[];
  reduce?: { latencyMs: number; tokenUsage?: TokenUsage };
  extraSpans?: AgentStageSpan[];
}): StudioJobTelemetrySnapshot {
  const mapResults = (input.mapResults ?? []).map(parseMapResult);
  const mapLatencyMs = mapResults.reduce((sum, result) => sum + (result.processingTimeMs ?? 0), 0);
  const mapUsage = mapResults.reduce<TokenUsage | undefined>(
    (sum, result) => addTokenUsage(sum, result.tokenUsage),
    undefined
  );
  const mapUsageOrUndefined = mapUsage !== undefined && mapUsage.total > 0 ? mapUsage : undefined;

  const reduceUsage =
    input.reduce?.tokenUsage !== undefined && input.reduce.tokenUsage.total > 0
      ? input.reduce.tokenUsage
      : undefined;

  const stageSpans: AgentStageSpan[] = [];
  if (mapResults.length > 0 || mapLatencyMs > 0 || mapUsageOrUndefined !== undefined) {
    stageSpans.push(
      withOptionalUsage({ stage: "map", latencyMs: mapLatencyMs }, mapUsageOrUndefined)
    );
  }
  if (input.reduce !== undefined) {
    stageSpans.push(
      withOptionalUsage({ stage: "reduce", latencyMs: input.reduce.latencyMs }, reduceUsage)
    );
  }
  if (input.extraSpans) {
    stageSpans.push(...input.extraSpans);
  }

  const tokenUsage = addTokenUsage(mapUsageOrUndefined, reduceUsage);
  const hasProvider = tokenUsage.total > 0;

  return {
    ...(hasProvider ? { tokenUsage, tokenUsageSource: "provider" as const } : {}),
    ...(stageSpans.length > 0 ? { stageSpans } : {}),
  };
}

export function withStudioTelemetryMetadata(
  metadata: Record<string, unknown>,
  snapshot: StudioJobTelemetrySnapshot
): Record<string, unknown> {
  return {
    ...metadata,
    ...(snapshot.tokenUsage !== undefined ? { tokenUsage: snapshot.tokenUsage } : {}),
    ...(snapshot.tokenUsageSource !== undefined
      ? { tokenUsageSource: snapshot.tokenUsageSource }
      : {}),
    ...(snapshot.stageSpans !== undefined ? { stageSpans: snapshot.stageSpans } : {}),
  };
}
