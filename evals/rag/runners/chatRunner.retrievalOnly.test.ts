import { describe, expect, it, vi } from "vitest";
import type { EvalFixture } from "../types";
import { type ChatAgentInvoker, runChatEval } from "./chatRunner";
import { snapshotRetrievalConfig } from "./config";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "retrieval-only-case",
  runner: "chat",
  question: "What does routing do?",
  notebookId: "nb",
  expectedItems: ["routing"],
  expectedBehavior: "b",
  tags: [],
};

function invokerReturning(extra: Record<string, unknown> = {}) {
  const invoke = vi.fn(async (_context: Record<string, unknown>) => ({
    answer: "",
    citations: [],
    subQueries: ["routing"],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    latencyMs: 5,
    ...extra,
  }));
  return { invoker: { invoke } as unknown as ChatAgentInvoker, invoke };
}

describe("runChatEval retrieval-only", () => {
  it("asks the invoker for a retrieval-only run", async () => {
    const { invoker, invoke } = invokerReturning({ retrievalOnly: true });

    await runChatEval({ fixture, config: snapshotRetrievalConfig(), retrievalOnly: true }, invoker);

    expect(invoke.mock.calls[0]?.[0]).toMatchObject({ evalRetrievalOnly: true });
  });

  it("marks the artifact retrieval-only when the deployment confirms the run stopped early", async () => {
    const { invoker } = invokerReturning({ retrievalOnly: true });

    const { artifact } = await runChatEval(
      { fixture, config: snapshotRetrievalConfig(), retrievalOnly: true },
      invoker
    );

    expect(artifact.retrievalOnly).toBe(true);
  });

  it("leaves an ordinary run unmarked and does not ask for a retrieval-only run", async () => {
    const { invoker, invoke } = invokerReturning();

    const { artifact } = await runChatEval({ fixture, config: snapshotRetrievalConfig() }, invoker);

    expect(invoke.mock.calls[0]?.[0].evalRetrievalOnly).toBeFalsy();
    expect(artifact.retrievalOnly).toBeUndefined();
  });

  it("marks a dry-run stub retrieval-only, so the retrieval-only metric set applies to it", async () => {
    const { artifact, errors } = await runChatEval({
      fixture,
      config: snapshotRetrievalConfig(),
      dryRun: true,
      retrievalOnly: true,
    });

    expect(errors).toEqual([]);
    expect(artifact.retrievalOnly).toBe(true);
  });
});
