import { describe, expect, it } from "vitest";
import {
  countEmbeddingCall,
  countLlmCall,
  countRerankCall,
  createCallCounters,
} from "./tokenUsageAccumulator";

describe("createCallCounters", () => {
  it("starts every counter at zero", () => {
    expect(createCallCounters()).toEqual({
      llmCalls: 0,
      embeddingCalls: 0,
      embeddingTexts: 0,
      rerankCalls: 0,
      rerankDocs: 0,
    });
  });

  it("returns a fresh object each time", () => {
    const a = createCallCounters();
    countLlmCall(a);
    expect(createCallCounters().llmCalls).toBe(0);
  });
});

describe("increment helpers", () => {
  it("countLlmCall adds one LLM call", () => {
    const counters = createCallCounters();
    countLlmCall(counters);
    countLlmCall(counters);
    expect(counters.llmCalls).toBe(2);
  });

  it("countEmbeddingCall adds one call and the number of texts embedded", () => {
    const counters = createCallCounters();
    countEmbeddingCall(counters);
    countEmbeddingCall(counters, 3);
    expect(counters.embeddingCalls).toBe(2);
    expect(counters.embeddingTexts).toBe(4);
  });

  it("countRerankCall adds one rerank call and the documents scored", () => {
    const counters = createCallCounters();
    countRerankCall(counters, 25);
    countRerankCall(counters, 7);
    expect(counters.rerankCalls).toBe(2);
    expect(counters.rerankDocs).toBe(32);
  });
});
