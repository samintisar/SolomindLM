import { afterEach, describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { registerPack, USE_CASE_PACKS } from "../usecases";
import type { UseCasePack } from "../usecases/types";
import { scoreAllMetrics } from "./scorers";

const pack: UseCasePack = {
  id: "wiring-pack",
  title: "Wiring",
  notebookTitle: "Wiring",
  advertisedClaim: "test",
  features: ["chat"],
  sources: [],
  rubric: [{ id: "cites", question: "Does it cite?", appliesTo: ["chat"], evidence: "sources" }],
};

const fixture = {
  id: "wiring-pack/chat-01",
  question: "What is in the source?",
  expectedItems: [],
  expectedBehavior: "",
  runner: "chat",
  tags: [],
  useCase: "wiring-pack",
} as unknown as EvalFixture;

const artifact = {
  caseId: fixture.id,
  runner: "chat",
  configHash: "h",
  answer: "Something.",
  citations: [],
  preRerankChunks: [],
  postRerankChunks: [],
  selectedChunks: [],
  subQueries: [],
  latencyMs: 1,
  timestamp: "2026-01-01T00:00:00.000Z",
} as EvalRunArtifact;

afterEach(() => {
  USE_CASE_PACKS.length = 0;
});

describe("scoreAllMetrics rubric wiring", () => {
  it("scores rubric checks for pack fixtures with source text as evidence", async () => {
    USE_CASE_PACKS.push(registerPack(pack, [fixture]));
    const prompts: string[] = [];
    const metrics = await scoreAllMetrics(fixture, artifact, undefined, {
      judgeInvoke: async (prompt) => {
        prompts.push(prompt);
        return '{"pass": true, "reason": "ok"}';
      },
      packSourceTexts: [{ fileName: "src.md", text: "Pack source text." }],
    });
    const rubric = metrics.filter((m) => m.metric.startsWith("rubric:"));
    expect(rubric.map((m) => [m.metric, m.status])).toEqual([["rubric:wiring-pack:cites", "pass"]]);
    expect(prompts.some((p) => p.includes("[src.md]\nPack source text."))).toBe(true);
  });

  it("skips rubric checks when judges are disabled (dry run)", async () => {
    USE_CASE_PACKS.push(registerPack(pack, [fixture]));
    const metrics = await scoreAllMetrics(fixture, artifact, undefined, { dryRun: true });
    expect(metrics.some((m) => m.metric.startsWith("rubric:"))).toBe(false);
  });
});
