import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { EvalRunArtifact } from "../types";
import { exportEvalRunArtifacts, loadArtifactsFromDir } from "./compare";

function stubArtifact(caseId: string, runner: EvalRunArtifact["runner"] = "chat"): EvalRunArtifact {
  return {
    caseId,
    runner,
    configHash: "abc",
    answer: `answer for ${caseId}`,
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 12,
    timestamp: "2026-08-18T00:00:00.000Z",
  };
}

describe("compareArtifactDirs aggregation", () => {
  it("computes win rate B with ties counting half", () => {
    const winsA = 2;
    const winsB = 3;
    const ties = 2;
    const total = winsA + winsB + ties;
    const winRateB = (winsB + ties / 2) / total;
    expect(winRateB).toBeCloseTo(0.571, 2);
  });
});

describe("eval artifact dump for pairwise compare", () => {
  it("roundtrips EvalRunArtifact JSON so --compare can load a run directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-art-"));
    try {
      exportEvalRunArtifacts(dir, [
        stubArtifact("agentic-patterns-20"),
        stubArtifact("research-001-inflation-factors", "research"),
      ]);
      const loaded = loadArtifactsFromDir(dir);
      expect(loaded).toHaveLength(2);
      const ids = loaded.map((a) => `${a.caseId}::${a.runner}`).toSorted();
      expect(ids).toEqual([
        "agentic-patterns-20::chat",
        "research-001-inflation-factors::research",
      ]);
      expect(loaded.find((a) => a.runner === "research")?.answer).toBe(
        "answer for research-001-inflation-factors"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips ragas.jsonl and files without caseId/runner", () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-art-"));
    try {
      writeFileSync(join(dir, "ragas.jsonl"), '{"question":"x"}\n');
      writeFileSync(join(dir, "report.json"), JSON.stringify({ summary: { fail: 1 } }));
      exportEvalRunArtifacts(dir, [stubArtifact("agentic-patterns-20")]);
      const loaded = loadArtifactsFromDir(dir);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.caseId).toBe("agentic-patterns-20");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
