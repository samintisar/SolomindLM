import { describe, expect, it } from "vitest";
import { AGENTIC_20_ITEMS } from "../fixtures/agentic-patterns-20";
import type { ChunkSnapshot, EvalFixture, EvalRunArtifact } from "../types";
import {
  abstentionCorrectness,
  citationValidity,
  expectedItemRecall,
  retrievalNdcgAtK,
  retrievalPrecisionAtK,
} from "./index";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "agentic-patterns-20",
  runner: "chat",
  question: "What are the 20 agentic patterns?",
  notebookId: "nb",
  expectedItems: [...AGENTIC_20_ITEMS],
  expectedBehavior: "Enumerate all 20 patterns",
  tags: [],
};

function artifact(partial: Partial<EvalRunArtifact> = {}): EvalRunArtifact {
  return {
    caseId: fixture.id,
    runner: "chat",
    configHash: "h",
    answer: "a",
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

function chunk(id: string, content: string): ChunkSnapshot {
  return { id, sourceTitle: "Agentic patterns", content, rankingScore: 0.5 };
}

const ALL_VERBATIM = AGENTIC_20_ITEMS.map((item) => `- ${item}`).join("\n");

describe("expectedItemRecall", () => {
  it("scores an abstaining answer that names no items as 0", () => {
    const result = expectedItemRecall(
      fixture,
      artifact({
        answer:
          "I could not find a list of agentic patterns in your sources. Please upload a document that covers this topic.",
      })
    );
    expect(result.score).toBe(0);
  });

  it("does not credit single words or substrings of items in a loose answer", () => {
    const result = expectedItemRecall(
      fixture,
      artifact({
        answer:
          "Agents plan what to do, use tools, remember things, talk to each other and are tested for safety.",
      })
    );
    expect(result.score).toBeLessThanOrEqual(0.05);
  });

  it("scores an answer listing all 20 items verbatim as 1", () => {
    const result = expectedItemRecall(fixture, artifact({ answer: ALL_VERBATIM }));
    expect(result.score).toBe(1);
  });

  it("matches 'tool use' through its own synonyms", () => {
    const score = (items: string[], answer: string) =>
      expectedItemRecall({ ...fixture, expectedItems: items }, artifact({ answer })).score;
    expect(score(["tool use"], "The agent uses tool calling.")).toBe(1);
    expect(score(["tool use"], "It relies on function calling.")).toBe(1);
    expect(score(["tool use"], "A router picks the route.")).toBe(0);
    expect(score(["routing"], "Agents use tool use to act.")).toBe(0);
  });

  it("does not let one item's synonyms credit another item", () => {
    const pairs: string[] = [];
    for (const i of AGENTIC_20_ITEMS) {
      for (const j of AGENTIC_20_ITEMS) {
        if (i === j) continue;
        const result = expectedItemRecall(
          { ...fixture, expectedItems: [i] },
          artifact({ answer: j })
        );
        if (result.score !== 0) pairs.push(`${i} <- ${j}`);
      }
    }
    expect(pairs).toEqual([]);
  });

  it("matches a plural or possessive of the item's last word", () => {
    const score = (items: string[], answer: string) =>
      expectedItemRecall({ ...fixture, expectedItems: items }, artifact({ answer })).score;
    expect(score(["routing"], "Routing's role is to pick the path.")).toBe(1);
    expect(score(["reflection"], "Several reflections improve the output.")).toBe(1);
    expect(score(["guardrails and safety patterns"], "Add a guardrail before the tool.")).toBe(1);
  });

  it("does not credit a multi-word item on generic pattern prose", () => {
    const score = (items: string[], answer: string) =>
      expectedItemRecall({ ...fixture, expectedItems: items }, artifact({ answer })).score;
    expect(score(["reasoning techniques"], "Various techniques; reasoning is hard")).toBe(0);
    expect(
      score(["guardrails and safety patterns"], "These design patterns matter for safety")
    ).toBe(0);
  });

  it("does not match a multi-word item on a substring of a word", () => {
    const result = expectedItemRecall(
      fixture,
      artifact({ answer: "Multi-agentic systems use interagentic messaging." })
    );
    expect(result.score).toBe(0);
  });
});

describe("punctuation between words", () => {
  const score = (items: string[], answer: string) =>
    expectedItemRecall({ ...fixture, expectedItems: items }, artifact({ answer })).score;

  it("matches an item in a CSV cell followed by the next cell", () => {
    expect(score(["prompt chaining"], '"Prompt Chaining","Breaks a task into steps"')).toBe(1);
    expect(score(["routing"], "Routing,Sends each request")).toBe(1);
  });

  it("matches an item followed by a slash or a bracket", () => {
    expect(score(["tool use"], "Tool Use/Function Calling")).toBe(1);
    expect(score(["reflection"], "(Reflection)")).toBe(1);
  });
});

describe("plural and compound matching", () => {
  const score = (items: string[], answer: string) =>
    expectedItemRecall({ ...fixture, expectedItems: items }, artifact({ answer })).score;

  it("matches a singular answer to a plural item, and a plural answer to a singular item", () => {
    expect(score(["neural networks"], "a neural network")).toBe(1);
    expect(score(["neural network"], "neural networks")).toBe(1);
    expect(score(["clinical trials"], "one clinical trial")).toBe(1);
  });

  it("does not strip the s from words whose s belongs to the stem", () => {
    expect(score(["lateral rectus"], "lateral rectus muscle")).toBe(1);
    // "analysis" keeps its s (it ends in "is"), so the plural "analyses" is not matched. This is
    // a known gap, recorded here rather than stemmed around.
    expect(score(["analysis"], "analyses were run")).toBe(0);
  });

  it("matches a hyphenated item written as one word in the answer", () => {
    expect(score(["feed-forward network"], "feedforward network")).toBe(1);
    expect(score(["multi-head attention"], "multihead attention")).toBe(1);
  });
});

describe("retrieval metrics on the word 'agent'", () => {
  const agentOnly = [chunk("c1", "Each agent runs one step at a time.")];

  it("does not treat a chunk containing only the word 'agent' as relevant to precision@K", () => {
    const result = retrievalPrecisionAtK(fixture, artifact({ selectedChunks: agentOnly }));
    expect(result.score).toBe(0);
  });

  it("does not treat a chunk containing only the word 'agent' as relevant to nDCG@K", () => {
    const result = retrievalNdcgAtK(fixture, artifact({ selectedChunks: agentOnly }));
    expect(result.score).toBe(0);
  });
});

describe("abstentionCorrectness on unanswerable fixtures", () => {
  const unanswerable: EvalFixture = {
    ...fixture,
    id: "wiring/unanswerable-01",
    expectedItems: [],
    expectAbstain: true,
  };

  it("passes with correct_abstention when the answer declines", () => {
    const result = abstentionCorrectness(
      unanswerable,
      artifact({
        answer: "I cannot find this in your sources, which do not cover it.",
        selectedChunks: [chunk("c1", "Unrelated text about something else.")],
      })
    );
    expect(result.status).toBe("pass");
    expect(result.breakdown?.category).toBe("correct_abstention");
  });

  it("fails with hallucination_under_pressure when the answer asserts facts", () => {
    const result = abstentionCorrectness(
      unanswerable,
      artifact({
        answer: "The drug is dosed at 5 mg twice daily for adults.",
        selectedChunks: [chunk("c1", "Unrelated text about something else.")],
      })
    );
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
    expect(result.breakdown?.category).toBe("hallucination_under_pressure");
  });

  it("applies the unanswerable rule even when retrieved passages match the question", () => {
    const result = abstentionCorrectness(
      unanswerable,
      artifact({
        answer: "Here is the answer from the sources.",
        selectedChunks: [chunk("c1", "The answer appears in this passage.")],
        preRerankChunks: [chunk("c1", "The answer appears in this passage.")],
      })
    );
    expect(result.breakdown?.category).toBe("hallucination_under_pressure");
  });

  it("leaves a fixture without expectAbstain on the existing rules", () => {
    const result = abstentionCorrectness(
      { ...unanswerable, expectAbstain: false },
      artifact({ answer: "I cannot find it.", selectedChunks: [] })
    );
    expect(result.breakdown?.category).toBe("none");
  });
});

describe("wrongful abstention needs low answer recall", () => {
  const items = ["cardiac", "renal", "hepatic", "neural", "thyroid"];
  const itemFixture: EvalFixture = { ...fixture, expectedItems: items };
  const withChunks = (answer: string) =>
    artifact({
      answer,
      selectedChunks: [chunk("c1", "cardiac renal hepatic neural thyroid organs.")],
      preRerankChunks: [chunk("c1", "cardiac renal hepatic neural thyroid organs.")],
    });

  it("is not a wrongful abstention when the answer lists 4 of 5 items and a decline for the fifth", () => {
    const result = abstentionCorrectness(
      itemFixture,
      withChunks(
        "The notes cover cardiac, renal, hepatic and neural organs. The notes do not mention the fifth."
      )
    );
    expect(result.breakdown?.category).not.toBe("answer_generation");
    expect(result.breakdown?.category).toBe("none");
    expect(result.status).toBe("pass");
  });

  it("is a wrongful abstention when the answer lists 1 of 5 items and declines", () => {
    const result = abstentionCorrectness(
      itemFixture,
      withChunks("Cardiac is covered. The notes do not mention the rest.")
    );
    expect(result.breakdown?.category).toBe("answer_generation");
    expect(result.status).toBe("fail");
  });
});

describe("decline forms on unanswerable fixtures", () => {
  const unanswerable: EvalFixture = {
    ...fixture,
    id: "wiring/unanswerable-forms",
    expectedItems: [],
    expectAbstain: true,
  };
  const declines = (answer: string) =>
    abstentionCorrectness(unanswerable, artifact({ answer })).breakdown?.category ===
    "correct_abstention";

  it.each([
    "The documents do not provide information about vaccine schedules.",
    "This is not covered in the selected documents.",
    "This is not covered in your notes.",
    "The sources do not cover that topic.",
    "The notes don't mention a dose.",
    "The papers do not discuss dementia.",
    "The report doesn't address exchange rates.",
    "The passages do not include anything on the question.",
    "There is no mention of pneumonia in the sources.",
    "No mention of statins appears in these papers.",
    "I don't see any information about the subjunctive.",
    "The answer is not mentioned in these documents.",
    "The dosing is not discussed in the notes.",
    "It is not addressed in the report.",
  ])("counts %j as a decline", (answer) => {
    expect(declines(answer)).toBe(true);
  });

  it("accepts curly apostrophes and quotes", () => {
    expect(declines("I don’t see any information about that.")).toBe(true);
    expect(declines("The sources don’t cover that, so I can’t say.")).toBe(true);
    expect(declines("The notes say “not covered in your documents”.")).toBe(true);
  });

  it("does not count a technical negation about the subject as a decline", () => {
    expect(declines("The study did not include children under 12.")).toBe(false);
    expect(declines("The sources do not agree on the dose.")).toBe(false);
    expect(declines("Points do not have enough neighbours to form a cluster.")).toBe(false);
    expect(declines("The drug is dosed at 5 mg twice daily.")).toBe(false);
  });

  it("does not require citations from a decline whose expectedBehavior names the sources", () => {
    const result = citationValidity(
      { ...unanswerable, expectedBehavior: "Pass if it says the sources do not cover it." },
      artifact({ answer: "The sources do not cover that.", citations: [] })
    );
    expect(result.status).toBe("pass");
    expect(result.breakdown?.expectsCitation).toBe(false);
  });

  it("accepts the reference answer of each unanswerable fixture", () => {
    const references = [
      "The notes do not cover the subjunctive, so the correct reply says the sources do not cover it and gives no subjunctive forms or rules.",
      "The notes do not cover the imperfect, so the correct reply says the sources do not cover it and gives no imperfect forms.",
      "The sources cover the heart, nerves and kidney, not immunisation, so the correct reply says the sources do not cover vaccine schedules and gives no doses or ages.",
      "The sources do not cover pneumonia or its treatment, so the correct reply says so and names no antibiotic or dose.",
      "The Beige Book covers regional economic conditions and does not mention Bitcoin or crypto mining, so the correct reply says the sources do not cover it and gives no prices or figures.",
      "The Beige Book is a US report and does not mention the European Central Bank, so the correct reply says the report does not cover it and gives no rate decisions.",
      "The four papers study depression and do not report dementia outcomes, so the correct reply says the sources do not cover dementia and gives no risk estimates.",
      "The papers do not mention vaccination, so the correct reply says the sources do not report it as a covariate and gives no adjustment details.",
    ];
    for (const reference of references) {
      expect(declines(reference)).toBe(true);
    }
  });

  it("matches the spaced 'I am not able to' and the 'isn't covered in' contraction", () => {
    expect(declines("I am not able to answer that.")).toBe(true);
    expect(declines("I’m not able to answer that.")).toBe(true);
    expect(declines("This isn't covered in the selected documents.")).toBe(true);
    expect(declines("This isn’t covered in your notes.")).toBe(true);
    // Technical negations about the subject still do not count as a decline.
    expect(declines("The model does not include a bias term.")).toBe(false);
  });
});
