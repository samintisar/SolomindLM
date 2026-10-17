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
}

/**
 * Per-turn collector for provider usage and call counters. The chat agent owns one per turn and
 * hands it to the LLM wrapper, so every call site records into the same place.
 */
export function createTurnTelemetry() {
  const usage = createTokenUsageAccumulator();
  const counters = createCallCounters();

  return {
    /** Counts one completed LLM call and adds its provider usage, when reported. */
    recordLlmCall(tokenUsage?: TokenUsage): void {
      countLlmCall(counters);
      usage.add(tokenUsage);
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
      return { tokenUsage, callCounters };
    },
  };
}

export type TurnTelemetry = ReturnType<typeof createTurnTelemetry>;
