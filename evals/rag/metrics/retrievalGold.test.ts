import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ChunkSnapshot, EvalFixture, EvalRunArtifact } from "../types";
import { abstentionCorrectness } from "./index";
import {
  normalisePassageText,
  passageFound,
  passageNdcgSelected,
  passagePrecisionSelected,
  passageRecallByStage,
} from "./retrievalGold";

const P = {
  a: "Routing sends each request to the specialist that can answer it best.",
  b: "Parallelization runs independent subtasks at the same time across workers.",
  c: "Reflection asks the model to critique its own draft before returning it.",
  d: "Guardrails check inputs and outputs so unsafe content never reaches the user.",
  e: "Memory management keeps the useful parts of past turns within the budget.",
};

const fixture = (partial: Partial<EvalFixture> = {}): EvalFixture => ({
  schemaVersion: 1,
  id: "case-passages",
  runner: "chat",
  question: "Which patterns are described?",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "Answers from the notes",
  tags: [],
  expectedPassages: [P.a, P.b, P.c, P.d, P.e],
  ...partial,
});

const chunk = (id: string, content: string, contextText?: string): ChunkSnapshot => ({
  id,
  sourceTitle: "Patterns",
  content,
  ...(contextText !== undefined ? { contextText } : {}),
});

function artifact(partial: Partial<EvalRunArtifact> = {}): EvalRunArtifact {
  return {
    caseId: "case-passages",
    runner: "chat",
    configHash: "h",
    answer: "",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 10,
    timestamp: "2026-10-17T00:00:00.000Z",
    ...partial,
  };
}

describe("normalisePassageText", () => {
  it("lowercases, collapses whitespace and drops markdown and punctuation", () => {
    expect(normalisePassageText("  **Routing**\n\n  sends,   requests!  ")).toBe(
      "routing sends requests"
    );
  });

  it("treats apostrophes and typographic quotes alike", () => {
    expect(normalisePassageText("It’s the agent’s job")).toBe(
      normalisePassageText("It's the agent's job")
    );
    expect(normalisePassageText("“quoted” text")).toBe("quoted text");
  });

  it("treats every dash as a word break", () => {
    expect(normalisePassageText("human–in-the—loop")).toBe("human in the loop");
    expect(normalisePassageText("pre-rerank")).toBe("pre rerank");
  });

  it("keeps decimal points and thousands separators inside numbers", () => {
    expect(normalisePassageText("rate 3.5 and 1,000 units.")).toBe("rate 3.5 and 1,000 units");
    expect(normalisePassageText("rate 3 5")).not.toBe(normalisePassageText("rate 3.5"));
  });
});

describe("passageFound", () => {
  it("matches a quote that appears verbatim despite case and whitespace differences", () => {
    expect(passageFound(`intro\n${P.a.toUpperCase()}\nmore`, P.a)).toBe(true);
  });

  it("matches on word boundaries only", () => {
    expect(passageFound("bathe cat", "the cat")).toBe(false);
  });

  it("does not match a quote with a number altered", () => {
    expect(passageFound("the rate is 3.5 percent", "the rate is 35 percent")).toBe(false);
  });

  it("never matches an empty quote", () => {
    expect(passageFound("anything", "  ...  ")).toBe(false);
  });
});

describe("passageRecallByStage", () => {
  it("returns three info rows, each saying there are no expectedPassages when the fixture has none", () => {
    const rows = passageRecallByStage(fixture({ expectedPassages: undefined }), artifact());
    expect(rows.map((r) => r.metric)).toEqual([
      "passage_recall_pre_rerank",
      "passage_recall_post_rerank",
      "passage_recall_selected",
    ]);
    for (const row of rows) {
      expect(row.status).toBe("info");
      expect(row.detail).toMatch(/No expectedPassages/);
    }
  });

  it("scores each stage separately and grades the selected stage", () => {
    const [pre, post, selected] = passageRecallByStage(
      fixture(),
      artifact({
        preRerankChunks: [chunk("1", P.a), chunk("2", P.b), chunk("3", P.c), chunk("4", P.d)],
        postRerankChunks: [chunk("1", P.a), chunk("2", P.b), chunk("3", P.c)],
        selectedChunks: [chunk("1", P.a), chunk("2", P.b), chunk("3", P.c), chunk("4", P.d)],
      })
    );
    expect(pre).toMatchObject({ status: "info", score: 0.8 });
    expect(post).toMatchObject({ status: "info", score: 0.6 });
    expect(selected).toMatchObject({ status: "pass", score: 0.8 });
  });

  it("grades selected recall warn at 0.5 and fail below it", () => {
    const three = passageRecallByStage(
      fixture(),
      artifact({ selectedChunks: [chunk("1", P.a), chunk("2", P.b), chunk("3", P.c)] })
    )[2];
    expect(three).toMatchObject({ status: "warn", score: 0.6 });

    const two = passageRecallByStage(
      fixture(),
      artifact({ selectedChunks: [chunk("1", P.a), chunk("2", P.b)] })
    )[2];
    expect(two).toMatchObject({ status: "fail", score: 0.4 });
  });

  it("reads contextText in preference to content", () => {
    const [, , selected] = passageRecallByStage(
      fixture({ expectedPassages: [P.a] }),
      artifact({ selectedChunks: [chunk("1", "unrelated", P.a)] })
    );
    expect(selected.score).toBe(1);
  });

  it("finds a quote split across two adjacent selected chunks, but not across unordered pre-rerank chunks", () => {
    const quote = P.a;
    const cut = quote.indexOf("specialist");
    const left = quote.slice(0, cut);
    const right = quote.slice(cut);
    const [pre, , selected] = passageRecallByStage(
      fixture({ expectedPassages: [quote] }),
      artifact({
        preRerankChunks: [chunk("2", right), chunk("1", left)],
        selectedChunks: [chunk("1", left), chunk("2", right)],
      })
    );
    expect(selected.score).toBe(1);
    expect(pre.score).toBe(0);
  });

  it("lists the passages a stage missed and the upstream recalls on the selected row", () => {
    const [, , selected] = passageRecallByStage(
      fixture(),
      artifact({
        preRerankChunks: [chunk("1", P.a), chunk("2", P.b), chunk("3", P.c)],
        postRerankChunks: [chunk("1", P.a), chunk("2", P.b), chunk("3", P.c)],
        selectedChunks: [chunk("1", P.a)],
      })
    );
    expect(selected.breakdown).toMatchObject({
      preRerankRecall: 0.6,
      postRerankRecall: 0.6,
      missing: [P.b, P.c, P.d, P.e],
    });
  });
});

describe("passagePrecisionSelected", () => {
  const filler = (i: number) => chunk(`f${i}`, `filler text number ${i} with no quote`);

  it("is info without expectedPassages", () => {
    const row = passagePrecisionSelected(fixture({ expectedPassages: undefined }), artifact());
    expect(row).toMatchObject({ metric: "passage_precision_selected", status: "info" });
    expect(row.detail).toMatch(/No expectedPassages/);
  });

  it("is the share of selected chunks holding a passage: pass at 0.4, warn at 0.2", () => {
    const pass = passagePrecisionSelected(
      fixture(),
      artifact({
        selectedChunks: [
          chunk("1", P.a),
          chunk("2", P.b),
          chunk("3", P.c),
          chunk("4", P.d),
          ...[0, 1, 2, 3, 4, 5].map(filler),
        ],
      })
    );
    expect(pass).toMatchObject({ status: "pass", score: 0.4 });

    const warn = passagePrecisionSelected(
      fixture(),
      artifact({
        selectedChunks: [chunk("1", P.a), chunk("2", P.b), ...[0, 1, 2, 3, 4, 5, 6].map(filler)],
      })
    );
    expect(warn.score).toBeCloseTo(2 / 9, 5);
    expect(warn.status).toBe("warn");
  });

  it("counts a chunk once even when it holds several passages", () => {
    const row = passagePrecisionSelected(
      fixture(),
      artifact({ selectedChunks: [chunk("1", `${P.a} ${P.b}`), chunk("2", "nothing here")] })
    );
    expect(row.score).toBe(0.5);
  });

  it("fails when nothing was selected", () => {
    const row = passagePrecisionSelected(fixture(), artifact());
    expect(row).toMatchObject({ status: "fail", score: 0 });
  });
});

describe("passageNdcgSelected", () => {
  it("is info without expectedPassages", () => {
    const row = passageNdcgSelected(fixture({ expectedPassages: undefined }), artifact());
    expect(row).toMatchObject({ metric: "passage_ndcg_selected", status: "info" });
  });

  it("uses the binary nDCG formula: pass at 0.7, warn at 0.4", () => {
    const off = (i: number) => chunk(`n${i}`, `no quote here ${i}`);
    const relevantAt = (rank: number) =>
      artifact({
        selectedChunks: Array.from({ length: rank }, (_, i) =>
          i === rank - 1 ? chunk("hit", P.a) : off(i)
        ),
      });

    expect(passageNdcgSelected(fixture(), relevantAt(1))).toMatchObject({
      status: "pass",
      score: 1,
    });
    // Relevant at rank 2: 1/log2(3) ≈ 0.631, warn.
    const atTwo = passageNdcgSelected(fixture(), relevantAt(2));
    expect(atTwo.score).toBeCloseTo(0.631, 3);
    expect(atTwo.status).toBe("warn");
    // Relevant at rank 5: 1/log2(6) ≈ 0.387, fail.
    expect(passageNdcgSelected(fixture(), relevantAt(5))).toMatchObject({ status: "fail" });
  });

  it("fails when nothing was selected", () => {
    expect(passageNdcgSelected(fixture(), artifact())).toMatchObject({
      status: "fail",
      score: 0,
    });
  });
});

describe("abstentionCorrectness with expectedPassages and no expectedItems", () => {
  const abstain = "I cannot find this in the notes.";
  const answering = `Yes. ${P.a} ${P.b} ${P.c} ${P.d} ${P.e}`;
  const selectedFive = [
    chunk("1", P.a),
    chunk("2", P.b),
    chunk("3", P.c),
    chunk("4", P.d),
    chunk("5", P.e),
  ];

  it("fails an abstention when the selected passages were sufficient (answer generation)", () => {
    const row = abstentionCorrectness(
      fixture(),
      artifact({ answer: abstain, selectedChunks: selectedFive, preRerankChunks: selectedFive })
    );
    expect(row).toMatchObject({ status: "fail" });
    expect(row.breakdown).toMatchObject({ category: "answer_generation", abstains: true });
  });

  it("fails context selection when pre-selection had the passages but selection dropped them", () => {
    const row = abstentionCorrectness(
      fixture(),
      artifact({
        answer: abstain,
        preRerankChunks: selectedFive,
        postRerankChunks: selectedFive,
        selectedChunks: [chunk("1", P.a)],
      })
    );
    expect(row).toMatchObject({ status: "fail" });
    expect(row.breakdown).toMatchObject({ category: "context_selection" });
  });

  it("warns retrieval coverage when no stage found enough passages", () => {
    const row = abstentionCorrectness(
      fixture(),
      artifact({
        answer: abstain,
        preRerankChunks: [chunk("1", P.a)],
        selectedChunks: [chunk("1", P.a)],
      })
    );
    expect(row).toMatchObject({ status: "warn" });
    expect(row.breakdown).toMatchObject({ category: "retrieval_coverage" });
  });

  it("passes an answer when the selected passages are sufficient and the answer uses them", () => {
    const row = abstentionCorrectness(
      fixture(),
      artifact({ answer: answering, selectedChunks: selectedFive })
    );
    expect(row).toMatchObject({ status: "pass" });
    expect(row.breakdown).toMatchObject({ category: "none", abstains: false });
  });

  it("keeps the no-items pass when neither expectedItems nor expectedPassages is set", () => {
    const row = abstentionCorrectness(
      fixture({ expectedPassages: undefined }),
      artifact({ answer: abstain })
    );
    expect(row).toMatchObject({ status: "pass", breakdown: { category: "none" } });
  });
});

describe("abstentionCorrectness passage thresholds", () => {
  const abstain = "I cannot find this in the notes.";
  const three = fixture({ expectedPassages: [P.a, P.b, P.c] });

  it("counts two of three passages as sufficient (0.6): an abstention then fails as answer generation", () => {
    const row = abstentionCorrectness(
      three,
      artifact({
        answer: abstain,
        preRerankChunks: [chunk("1", P.a), chunk("2", P.b), chunk("3", P.c)],
        selectedChunks: [chunk("1", P.a), chunk("2", P.b)],
      })
    );
    expect(row).toMatchObject({ status: "fail" });
    expect(row.breakdown).toMatchObject({ category: "answer_generation" });
  });

  it("passes an answer that uses two of three selected passages", () => {
    const row = abstentionCorrectness(
      three,
      artifact({
        answer: `Yes. ${P.a} ${P.b}`,
        selectedChunks: [chunk("1", P.a), chunk("2", P.b)],
      })
    );
    expect(row).toMatchObject({ status: "pass" });
  });

  it("fails context selection when only one of three passages survives selection (0.33 < 0.5)", () => {
    const row = abstentionCorrectness(
      three,
      artifact({
        answer: abstain,
        preRerankChunks: [chunk("1", P.a), chunk("2", P.b), chunk("3", P.c)],
        selectedChunks: [chunk("1", P.a)],
      })
    );
    expect(row).toMatchObject({ status: "fail" });
    expect(row.breakdown).toMatchObject({ category: "context_selection" });
  });

  it("warns context selection when half of four passages survive selection (0.5)", () => {
    const four = fixture({ expectedPassages: [P.a, P.b, P.c, P.d] });
    const row = abstentionCorrectness(
      four,
      artifact({
        answer: abstain,
        preRerankChunks: [chunk("1", P.a), chunk("2", P.b), chunk("3", P.c), chunk("4", P.d)],
        selectedChunks: [chunk("1", P.a), chunk("2", P.b)],
      })
    );
    expect(row).toMatchObject({ status: "warn" });
    expect(row.breakdown).toMatchObject({ category: "context_selection" });
  });

  it("keeps item mode at 0.7: two of three items selected fails context selection", () => {
    const items = fixture({
      expectedItems: ["routing", "parallelization", "reflection"],
      expectedPassages: undefined,
    });
    const row = abstentionCorrectness(
      items,
      artifact({
        answer: abstain,
        preRerankChunks: [chunk("1", P.a), chunk("2", P.b), chunk("3", P.c)],
        selectedChunks: [chunk("1", P.a), chunk("2", P.b)],
      })
    );
    expect(row).toMatchObject({ status: "fail" });
    expect(row.breakdown).toMatchObject({ category: "context_selection" });
  });
});

describe("agentic-patterns-20 gold passages", () => {
  it("are three verbatim sentences of the 20-patterns source", async () => {
    const { agenticPatterns20 } = await import("../fixtures/agentic-patterns-20");
    const source = readFileSync(
      new URL("../fixtures/sources/master-20-agentic-patterns.md", import.meta.url),
      "utf-8"
    );
    const passages = agenticPatterns20.expectedPassages ?? [];
    expect(passages).toHaveLength(3);
    for (const quote of passages) {
      expect(source).toContain(quote);
    }
  });
});
