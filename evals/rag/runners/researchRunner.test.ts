import { describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import { snapshotRetrievalConfig } from "./config";
import type { ResearchAgentInvoker } from "./researchRunner";
import { runResearchEval } from "./researchRunner";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "r",
  runner: "research",
  question: "q",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "b",
  tags: [],
  sourcePolicy: { channels: ["web"] },
};

describe("runResearchEval tokenUsageSource", () => {
  it("defaults to estimated when the invoker omits the field", async () => {
    const invoker: ResearchAgentInvoker = {
      invoke: async () => ({
        answer: "a",
        subQuestions: [],
        evidence: [],
        latencyMs: 12,
        tokenUsage: { prompt: 1, completion: 2, total: 3 },
        iterations: 1,
      }),
    };

    const { artifact, errors } = await runResearchEval(
      { fixture, config: snapshotRetrievalConfig() },
      invoker
    );

    expect(errors).toEqual([]);
    expect(artifact.tokenUsageSource).toBe("estimated");
  });
});
