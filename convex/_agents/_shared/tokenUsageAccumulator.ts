import { type AgentStageName, type AgentStageSpan, createStageSpan } from "./stageSpans";
import { addTokenUsage, type TokenUsage } from "./usageAggregate";

export function createTokenUsageAccumulator() {
  let current: TokenUsage | undefined;

  return {
    add(usage?: TokenUsage) {
      if (usage === undefined || usage.total <= 0) {
        return;
      }
      current = addTokenUsage(current, usage);
    },
    consume(): TokenUsage | undefined {
      const usage = current;
      current = undefined;
      if (usage === undefined || usage.total <= 0) {
        return undefined;
      }
      return usage;
    },
  };
}

export type TokenUsageAccumulator = ReturnType<typeof createTokenUsageAccumulator>;

// ─── Call counters ───────────────────────────────────────────

/**
 * How many billable provider calls one chat turn made. Token usage only covers LLM calls, so these
 * counters are what makes embedding and rerank volume visible.
 */
export interface CallCounters {
  llmCalls: number;
  embeddingCalls: number;
  /** Texts sent to the embedding endpoint (a batch call counts once per text). */
  embeddingTexts: number;
  rerankCalls: number;
  /** Documents scored by rerank across all rerank calls. */
  rerankDocs: number;
}

export function createCallCounters(): CallCounters {
  return {
    llmCalls: 0,
    embeddingCalls: 0,
    embeddingTexts: 0,
    rerankCalls: 0,
    rerankDocs: 0,
  };
}

export function countLlmCall(counters: CallCounters): void {
  counters.llmCalls += 1;
}

export function countEmbeddingCall(counters: CallCounters, texts: number = 1): void {
  counters.embeddingCalls += 1;
  counters.embeddingTexts += texts;
}

export function countRerankCall(counters: CallCounters, documents: number): void {
  counters.rerankCalls += 1;
  counters.rerankDocs += documents;
}

// ─── Turn telemetry ──────────────────────────────────────────

/** What one chat turn reports on its `done` chunk. */
export interface TurnTelemetrySnapshot {
  tokenUsage?: TokenUsage;
  callCounters: CallCounters;
  stageSpans: AgentStageSpan[];
}

/**
 * Per-turn collector for provider usage, call counters and stage spans. The chat agent owns one per
 * turn and hands it to the LLM wrapper, so every call site records into the same place.
 */
export function createTurnTelemetry(options?: { now?: () => number }) {
  const now = options?.now ?? Date.now;
  const usage = createTokenUsageAccumulator();
  const counters = createCallCounters();
  let spans: AgentStageSpan[] = [];

  return {
    /**
     * Records one completed LLM call: counts it, adds its provider usage, and adds a span for the
     * stage it served. `startedAtMs` is when the call began.
     */
    recordLlmCall(stage: AgentStageName, startedAtMs: number, tokenUsage?: TokenUsage): void {
      countLlmCall(counters);
      usage.add(tokenUsage);
      spans.push(createStageSpan(stage, startedAtMs, { tokenUsage, now }));
    },
    /** Records a latency-only span for a stage that made no LLM call (e.g. grounding embeddings). */
    recordStage(stage: AgentStageName, startedAtMs: number): void {
      spans.push(createStageSpan(stage, startedAtMs, { now }));
    },
    /** Counts one embedding request covering `texts` inputs. */
    recordEmbeddingCall(texts: number = 1): void {
      countEmbeddingCall(counters, texts);
    },
    /** Counts one rerank request scoring `documents` documents. */
    recordRerankCall(documents: number): void {
      countRerankCall(counters, documents);
    },
    /** Returns the turn's telemetry and resets it. */
    snapshot(): TurnTelemetrySnapshot {
      const tokenUsage = usage.consume();
      const callCounters = { ...counters };
      Object.assign(counters, createCallCounters());
      const stageSpans = spans;
      spans = [];
      return { tokenUsage, callCounters, stageSpans };
    },
  };
}

export type TurnTelemetry = ReturnType<typeof createTurnTelemetry>;
