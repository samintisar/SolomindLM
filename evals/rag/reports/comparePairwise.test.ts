import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChunkSnapshot, EvalRunArtifact } from "../types";
import {
  compareArtifactDirs,
  comparePrompt,
  comparisonEvidence,
  exportEvalRunArtifacts,
  judgeArtifactPair,
} from "./compare";

function chunk(id: string, content: string): ChunkSnapshot {
  return { id, sourceTitle: `Source ${id}`, content };
}

function artifact(
  partial: Partial<EvalRunArtifact> & Pick<EvalRunArtifact, "caseId" | "answer">
): EvalRunArtifact {
  return {
    runner: "chat",
    configHash: "abc",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 1,
    timestamp: "2026-10-17T00:00:00.000Z",
    ...partial,
  };
}

/** Stub judge: picks the answer whose marker is shown in the "Answer A" slot, else B. */
function judgeByMarker(marker: string) {
  return async (prompt: string): Promise<string> => {
    const slotA = prompt.split("Answer A:\n")[1]?.split("\n")[0] ?? "";
    const winner = slotA.includes(marker) ? "A" : "B";
    return JSON.stringify({ winner, reason: `prefers ${marker}` });
  };
}

/** Stub judge that always names the answer in slot A, whatever the content. */
const alwaysSlotA = async () => JSON.stringify({ winner: "A", reason: "slot A" });

describe("comparisonEvidence", () => {
  it("unions both sides' chunks and keeps one copy of a passage both answers used", () => {
    const shared = "The 2024 report found  inflation\nfell to 3%.";
    const a = artifact({
      caseId: "c",
      answer: "a",
      selectedChunks: [chunk("1", shared), chunk("2", "Only A saw this.")],
    });
    const b = artifact({
      caseId: "c",
      answer: "b",
      selectedChunks: [
        chunk("9", "The 2024 report found inflation fell to 3%."),
        chunk("8", "Only B saw this."),
      ],
    });
    const evidence = comparisonEvidence(a, b);
    expect(evidence.split("Only A saw this.")).toHaveLength(2);
    expect(evidence.split("Only B saw this.")).toHaveLength(2);
    // Whitespace differs, but the content is the same passage: it appears once.
    expect(evidence.split("fell to 3%.")).toHaveLength(2);
  });

  it("says no passages were recorded when neither side has any", () => {
    const studio = artifact({ caseId: "c", runner: "report", answer: "b" });
    expect(comparisonEvidence(studio, studio)).toBe(
      "(no retrieved passages recorded for these outputs)"
    );
  });

  it("shows the side that has passages, noting that the other run recorded none", () => {
    const chat = artifact({
      caseId: "c",
      answer: "a",
      selectedChunks: [chunk("1", "Only A has a passage.")],
    });
    const studio = artifact({ caseId: "c", runner: "report", answer: "b" });
    const forwardEvidence = comparisonEvidence(chat, studio);
    expect(forwardEvidence).toContain("(run B recorded no passages)");
    expect(forwardEvidence).toContain("[A-1]");
    expect(forwardEvidence).toContain("Only A has a passage.");
    const reversedEvidence = comparisonEvidence(studio, chat);
    expect(reversedEvidence).toContain("(run A recorded no passages)");
    expect(reversedEvidence).toContain("[B-1]");
  });

  it("gives each run half the budget, so a verbose run cannot crowd the other out", () => {
    const verbose = Array.from({ length: 3 }, (_, i) =>
      chunk(String(i + 1), `A-body-${i} ${"x".repeat(9_000)}`)
    );
    const short = [chunk("1", `B-only ${"y".repeat(2_000)}`)];
    const evidence = comparisonEvidence(
      artifact({ caseId: "c", answer: "a", selectedChunks: verbose }),
      artifact({ caseId: "c", answer: "b", selectedChunks: short })
    );
    expect(evidence).toContain("[B-1]");
    expect(evidence).toContain("B-only");
    expect(evidence).toContain("[A-1]");
    expect(evidence).not.toContain("[A-2]");
    expect(evidence).toContain("passages not shown from run A: A-2, A-3");
    // Interleaved: A's first passage comes before B's, and both appear in that order.
    expect(evidence.indexOf("[A-1]")).toBeLessThan(evidence.indexOf("[B-1]"));
  });

  it("labels passages by run and tells the judge what each answer's citations mean", async () => {
    const a = artifact({
      caseId: "c",
      answer: "GOOD",
      citations: ["3"],
      selectedChunks: [chunk("3", "PASSAGE-FROM-A")],
    });
    const b = artifact({
      caseId: "c",
      answer: "BAD",
      citations: ["1"],
      selectedChunks: [chunk("1", "PASSAGE-FROM-B")],
    });
    const prompts: string[] = [];
    await judgeArtifactPair(
      async (prompt) => {
        prompts.push(prompt);
        return JSON.stringify({ winner: "tie", reason: "same" });
      },
      "Q?",
      a,
      b
    );
    const [forward, backward] = prompts;
    expect(forward).toContain("[A-3]");
    expect(forward).toContain("[B-1]");
    expect(forward).toContain("in Answer A, [n] refers to [A-n]");
    expect(forward).toContain("in Answer B, [n] refers to [B-n]");
    // Swapped: the run-B answer now sits in slot A, so its [n] refers to [B-n].
    expect(backward).toContain("in Answer A, [n] refers to [B-n]");
    expect(backward).toContain("in Answer B, [n] refers to [A-n]");
    // The evidence block itself is identical in both directions.
    const evidence = comparisonEvidence(a, b);
    expect(forward).toContain(evidence);
    expect(backward).toContain(evidence);
  });

  it("shows a passage both runs used once, with an alias for the other run's label", () => {
    const shared = "The shared passage  text.";
    const evidence = comparisonEvidence(
      artifact({ caseId: "c", answer: "a", selectedChunks: [chunk("3", shared)] }),
      artifact({
        caseId: "c",
        answer: "b",
        selectedChunks: [chunk("2", "The shared passage text."), chunk("4", "B's own.")],
      })
    );
    expect(evidence.split("The shared passage").length - 1).toBe(1);
    expect(evidence).toContain("[B-2] is the same passage as [A-3].");
    expect(evidence).toContain("[B-4]");
  });

  it("truncates the union at 24 000 characters with the cut note", () => {
    const long = "x".repeat(20_000);
    const a = artifact({ caseId: "c", answer: "a", selectedChunks: [chunk("1", long)] });
    const b = artifact({
      caseId: "c",
      answer: "b",
      selectedChunks: [chunk("2", `${long}y`)],
    });
    const evidence = comparisonEvidence(a, b);
    expect(evidence.length).toBeLessThan(24_500);
    expect(evidence).toContain("Some retrieved passages were cut off for judging");
  });
});

describe("comparePrompt", () => {
  it("shows the evidence before the answers and orders the criteria grounding first", () => {
    const prompt = comparePrompt("Q?", "first answer", "second answer", "PASSAGE-EVIDENCE");
    const evidenceAt = prompt.indexOf("PASSAGE-EVIDENCE");
    const answerAt = prompt.indexOf("Answer A:");
    expect(evidenceAt).toBeGreaterThan(0);
    expect(evidenceAt).toBeLessThan(answerAt);
    const grounding = prompt.indexOf("Grounding");
    const completeness = prompt.indexOf("Completeness");
    const clarity = prompt.indexOf("Clarity");
    expect(grounding).toBeLessThan(completeness);
    expect(completeness).toBeLessThan(clarity);
    expect(prompt).toContain("Do not prefer an answer because it is longer.");
  });

  it("keeps each answer at 6 000 characters", () => {
    // Distinct marker characters, so a count only sees the answer text.
    const prompt = comparePrompt("Q?", "¤".repeat(9_000), "§".repeat(9_000), "ev");
    expect(prompt.split("¤").length - 1).toBe(6_000);
    expect(prompt.split("§").length - 1).toBe(6_000);
  });
});

describe("judgeArtifactPair", () => {
  let a: EvalRunArtifact;
  let b: EvalRunArtifact;
  beforeEach(() => {
    a = artifact({
      caseId: "c",
      answer: "GOOD answer",
      selectedChunks: [chunk("1", "UNIQUE-PASSAGE-ONE")],
    });
    b = artifact({
      caseId: "c",
      answer: "BAD answer",
      selectedChunks: [chunk("1", "UNIQUE-PASSAGE-TWO")],
    });
  });

  it("shows evidence from both sides once in each prompt, in both position orders", async () => {
    const prompts: string[] = [];
    const invoke = async (prompt: string) => {
      prompts.push(prompt);
      return JSON.stringify({ winner: "tie", reason: "same" });
    };
    await judgeArtifactPair(invoke, "Q?", a, b);
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt.split("UNIQUE-PASSAGE-ONE").length - 1).toBe(1);
      expect(prompt.split("UNIQUE-PASSAGE-TWO").length - 1).toBe(1);
    }
  });

  it("swaps positions and maps both verdicts back to artifact A/B", async () => {
    const result = await judgeArtifactPair(judgeByMarker("GOOD"), "Q?", a, b);
    expect(result).toMatchObject({ winner: "a", forward: "a", backward: "a" });
  });

  it("counts a verdict that flips with position as a tie", async () => {
    const result = await judgeArtifactPair(alwaysSlotA, "Q?", a, b);
    expect(result.forward).toBe("a");
    expect(result.backward).toBe("b");
    expect(result.winner).toBe("tie");
  });
});

describe("compareArtifactDirs with a stub judge", () => {
  let dirA: string;
  let dirB: string;
  beforeEach(() => {
    dirA = mkdtempSync(join(tmpdir(), "cmp-a-"));
    dirB = mkdtempSync(join(tmpdir(), "cmp-b-"));
  });
  afterEach(() => {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  });

  it("reports position disagreements and counts them", async () => {
    exportEvalRunArtifacts(dirA, [artifact({ caseId: "x-case", answer: "GOOD" })]);
    exportEvalRunArtifacts(dirB, [artifact({ caseId: "x-case", answer: "BAD" })]);
    const report = await compareArtifactDirs({
      pathA: dirA,
      pathB: dirB,
      invoke: alwaysSlotA,
    });
    expect(report.casesCompared).toBe(1);
    expect(report.positionDisagreements).toBe(1);
    expect(report.ties).toBe(1);
    const [only] = report.cases;
    expect(only).toMatchObject({ winner: "tie", forward: "a", backward: "b" });
    expect(only?.reasonForward).toBe("slot A");
    expect(only?.reason).toMatch(/position disagreement/);
  });

  it("does not count a tie in one order against a winner in the other as a position split", async () => {
    exportEvalRunArtifacts(dirA, [artifact({ caseId: "x-case", answer: "GOOD" })]);
    exportEvalRunArtifacts(dirB, [artifact({ caseId: "x-case", answer: "BAD" })]);
    // Forward (run A in slot A): tie. Swapped (run B in slot A): picks slot A, which is run B.
    const report = await compareArtifactDirs({
      pathA: dirA,
      pathB: dirB,
      invoke: async (prompt) => {
        const slotA = prompt.split("Answer A:\n")[1]?.split("\n")[0] ?? "";
        return slotA.includes("GOOD")
          ? JSON.stringify({ winner: "tie", reason: "close" })
          : JSON.stringify({ winner: "A", reason: "slot A" });
      },
    });
    const [only] = report.cases;
    expect(only).toMatchObject({ winner: "tie", forward: "tie", backward: "b" });
    expect(report.positionDisagreements).toBe(0);
  });

  it("reports no disagreements when the judge is consistent", async () => {
    exportEvalRunArtifacts(dirA, [artifact({ caseId: "x-case", answer: "GOOD" })]);
    exportEvalRunArtifacts(dirB, [artifact({ caseId: "x-case", answer: "BAD" })]);
    const report = await compareArtifactDirs({
      pathA: dirA,
      pathB: dirB,
      invoke: judgeByMarker("GOOD"),
    });
    expect(report.positionDisagreements).toBe(0);
    expect(report.winsA).toBe(1);
  });
});
