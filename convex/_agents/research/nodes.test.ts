"use node";

import { describe, it, expect } from "vitest";
import { retrieverNode } from "./nodes";
import type { ResearchNodeDeps } from "./nodes";
import type { ResearchStateType } from "./state";

describe("safeGetDomain (via retrieverNode)", () => {
  const createDeps = (discoverSourcesImpl?: ResearchNodeDeps["discoverSources"]) => ({
    apiKey: "test",
    smartModel: "test-model",
    runHybridSearch: async () => [],
    discoverSources: discoverSourcesImpl,
    loadWebPage: async (url: string) => ({ title: "test", content: "test content", url }),
    onProgress: async () => {},
  });

  it("should not crash when discoverSources returns an invalid URL", async () => {
    const state: ResearchStateType = {
      query: "test",
      subQuestions: [
        {
          id: "sq1",
          question: "test question",
          searchQueries: ["test query"],
          sourceChannels: ["web"],
          status: "pending",
        },
      ],
      sourcePolicy: { channels: ["web"], maxResultsPerChannel: 5 },
      evidence: [],
      gaps: [],
      iteration: 0,
      maxIterations: 2,
      conversationHistory: [],
      documentIds: undefined,
      notebookId: "",
      userId: "",
      shouldStop: false,
      stopReason: "",
      finalResponse: "",
    };

    const deps = createDeps(async () => [
      {
        title: "Bad URL Source",
        url: "not-a-valid-url",
        snippet: "snippet content",
        sourceType: "web",
        score: 0.9,
      },
    ]);

    // This should NOT throw even though the URL is invalid
    const result = await retrieverNode(state, deps);
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.length).toBeGreaterThan(0);
    expect(result.evidence![0].metadata?.domain).toBeUndefined();
  });

  it("should not crash when discoverSources returns an empty URL", async () => {
    const state: ResearchStateType = {
      query: "test",
      subQuestions: [
        {
          id: "sq1",
          question: "test question",
          searchQueries: ["test query"],
          sourceChannels: ["web"],
          status: "pending",
        },
      ],
      sourcePolicy: { channels: ["web"], maxResultsPerChannel: 5 },
      evidence: [],
      gaps: [],
      iteration: 0,
      maxIterations: 2,
      conversationHistory: [],
      documentIds: undefined,
      notebookId: "",
      userId: "",
      shouldStop: false,
      stopReason: "",
      finalResponse: "",
    };

    const deps = createDeps(async () => [
      {
        title: "Empty URL Source",
        url: "",
        snippet: "snippet content",
        sourceType: "web",
        score: 0.9,
      },
    ]);

    const result = await retrieverNode(state, deps);
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.length).toBeGreaterThan(0);
    expect(result.evidence![0].metadata?.domain).toBeUndefined();
  });

  it("should extract domain for valid URLs", async () => {
    const state: ResearchStateType = {
      query: "test",
      subQuestions: [
        {
          id: "sq1",
          question: "test question",
          searchQueries: ["test query"],
          sourceChannels: ["web"],
          status: "pending",
        },
      ],
      sourcePolicy: { channels: ["web"], maxResultsPerChannel: 5 },
      evidence: [],
      gaps: [],
      iteration: 0,
      maxIterations: 2,
      conversationHistory: [],
      documentIds: undefined,
      notebookId: "",
      userId: "",
      shouldStop: false,
      stopReason: "",
      finalResponse: "",
    };

    const deps = createDeps(async () => [
      {
        title: "Good URL Source",
        url: "https://example.com/page",
        snippet: "snippet content",
        sourceType: "web",
        score: 0.9,
      },
    ]);

    const result = await retrieverNode(state, deps);
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.length).toBeGreaterThan(0);
    expect(result.evidence![0].metadata?.domain).toBe("example.com");
  });
});
