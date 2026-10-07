import { describe, expect, it } from "vitest";
import type { ReferenceChunk } from "../../../convex/_agents/chat/types";
import type { EvalFixture } from "../types";
import { type ChatAgentInvoker, runChatEval } from "./chatRunner";
import { snapshotRetrievalConfig } from "./config";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "c",
  runner: "chat",
  question: "q",
  notebookId: "nb",
  expectedItems: ["item"],
  expectedBehavior: "b",
  tags: [],
};

describe("runChatEval stageSpans", () => {
  it("copies stageSpans from the invoker onto the artifact", async () => {
    const invoker: ChatAgentInvoker = {
      invoke: async () => ({
        answer: "a",
        citations: [],
        subQueries: [],
        preRerankChunks: [],
        postRerankChunks: [],
        selectedChunks: [],
        latencyMs: 90,
        tokenUsage: { prompt: 11, completion: 7, total: 18 },
        tokenUsageSource: "provider",
        stageSpans: [
          { stage: "retrieve", latencyMs: 40 },
          { stage: "rerank", latencyMs: 25 },
          { stage: "select", latencyMs: 10 },
        ],
      }),
    };

    const { artifact, errors } = await runChatEval(
      { fixture, config: snapshotRetrievalConfig() },
      invoker
    );

    expect(errors).toEqual([]);
    expect(artifact.tokenUsageSource).toBe("provider");
    expect(artifact.stageSpans).toEqual([
      { stage: "retrieve", latencyMs: 40 },
      { stage: "rerank", latencyMs: 25 },
      { stage: "select", latencyMs: 10 },
    ]);
  });

  it("records each selected passage as the model saw it, previews included", async () => {
    const passage: ReferenceChunk = {
      id: "1",
      sourceId: "s",
      sourceTitle: "Paper",
      chunkIndex: 3,
      content: "Thresholds were applied [43].",
      metadata: { nextChunkPreview: "MVPA was self-reported with the IPAQ" },
    };
    const invoker: ChatAgentInvoker = {
      invoke: async () => ({
        answer: "a",
        citations: [],
        subQueries: [],
        preRerankChunks: [],
        postRerankChunks: [],
        selectedChunks: [passage],
        latencyMs: 90,
      }),
    };

    const { artifact } = await runChatEval({ fixture, config: snapshotRetrievalConfig() }, invoker);

    expect(artifact.selectedChunks[0]?.content).toBe("Thresholds were applied [43].");
    expect(artifact.selectedChunks[0]?.contextText).toBe(
      "Thresholds were applied .\n\nMVPA was self-reported with the IPAQ..."
    );
  });
});
