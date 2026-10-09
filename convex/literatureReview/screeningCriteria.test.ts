import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCREENING_CRITERIA,
  decideScreening,
  formatCriteriaForPrompt,
  MAX_SCREENING_CRITERIA,
  normalizeCriterionStatus,
  normalizeScreeningCriteria,
  resolveScreeningDecisions,
  type ScreeningCriterion,
  screeningFailureDecision,
} from "./screeningCriteria";

const CRITERIA: ScreeningCriterion[] = [
  { label: "On topic", description: "Directly studies the phenomenon in the question." },
  { label: "Empirical evidence", description: "Reports experiments or a formal evaluation." },
  { label: "Comparison", description: "Compares at least two of the approaches in question." },
];

describe("normalizeScreeningCriteria", () => {
  it("falls back to the default criteria when none are given", () => {
    expect(normalizeScreeningCriteria(undefined)).toEqual(DEFAULT_SCREENING_CRITERIA);
    expect(normalizeScreeningCriteria([])).toEqual(DEFAULT_SCREENING_CRITERIA);
  });

  it("falls back to the defaults when fewer than two usable criteria remain", () => {
    expect(normalizeScreeningCriteria([{ label: "Only one", description: "x" }])).toEqual(
      DEFAULT_SCREENING_CRITERIA
    );
  });

  it("trims, drops blank labels, and removes duplicate labels", () => {
    const result = normalizeScreeningCriteria([
      { label: "  On topic ", description: " Studies the question. " },
      { label: "", description: "No label" },
      { label: "on topic", description: "Duplicate" },
      { label: "Evidence", description: "" },
    ]);

    expect(result).toEqual([
      { label: "On topic", description: "Studies the question." },
      { label: "Evidence", description: "Evidence" },
    ]);
  });

  it("caps the number of criteria", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      label: `Criterion ${i}`,
      description: `Description ${i}`,
    }));
    expect(normalizeScreeningCriteria(many)).toHaveLength(MAX_SCREENING_CRITERIA);
  });

  it("keeps the generic defaults free of topic-specific wording", () => {
    expect(DEFAULT_SCREENING_CRITERIA.length).toBeGreaterThanOrEqual(2);
    for (const c of DEFAULT_SCREENING_CRITERIA) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });
});

describe("formatCriteriaForPrompt", () => {
  it("numbers each criterion with its label and description", () => {
    expect(formatCriteriaForPrompt(CRITERIA.slice(0, 2))).toBe(
      "1. On topic: Directly studies the phenomenon in the question.\n" +
        "2. Empirical evidence: Reports experiments or a formal evaluation."
    );
  });
});

describe("normalizeCriterionStatus", () => {
  it.each([
    ["met", "met"],
    ["Met", "met"],
    ["yes", "met"],
    ["not_met", "not_met"],
    ["not met", "not_met"],
    ["NOT-MET", "not_met"],
    ["no", "not_met"],
    ["unclear", "unclear"],
    ["partial", "unclear"],
    ["", "unclear"],
  ] as const)("reads %j as %s", (raw, expected) => {
    expect(normalizeCriterionStatus(raw)).toBe(expected);
  });
});

describe("decideScreening", () => {
  const allMet = CRITERIA.map((_, i) => ({ criterion: i + 1, status: "met", explanation: "Yes." }));

  it("includes a paper the screener includes and that meets every criterion", () => {
    const decision = decideScreening(
      { isIncluded: true, reason: "Compares the approaches empirically.", criteria: allMet },
      CRITERIA
    );

    expect(decision.isIncluded).toBe(true);
    expect(decision.reason).toBe("Compares the approaches empirically.");
    expect(decision.criteria?.map((c) => [c.label, c.status])).toEqual([
      ["On topic", "met"],
      ["Empirical evidence", "met"],
      ["Comparison", "met"],
    ]);
  });

  it("excludes a paper that fails a criterion even when the screener said include", () => {
    const decision = decideScreening(
      {
        isIncluded: true,
        reason: "Relevant to the topic.",
        criteria: [
          { criterion: 1, status: "met", explanation: "On topic." },
          { criterion: 2, status: "met", explanation: "Has experiments." },
          { criterion: 3, status: "not_met", explanation: "Studies one approach only." },
        ],
      },
      CRITERIA
    );

    expect(decision.isIncluded).toBe(false);
    expect(decision.reason).toContain("Comparison");
    expect(decision.reason).toContain("Studies one approach only.");
  });

  it("keeps the stricter answer when a criterion is checked twice, in either order", () => {
    const met = { criterion: 1, status: "met", explanation: "On topic." };
    const notMet = { criterion: 1, status: "not_met", explanation: "Studies another topic." };
    const rest = [
      { criterion: 2, status: "met", explanation: "Yes." },
      { criterion: 3, status: "met", explanation: "Yes." },
    ];

    // Both orders, so neither first-answer-wins nor last-answer-wins passes.
    for (const duplicates of [
      [met, notMet],
      [notMet, met],
    ]) {
      const decision = decideScreening(
        { isIncluded: true, reason: "Fits.", criteria: [...duplicates, ...rest] },
        CRITERIA
      );

      expect(decision.isIncluded).toBe(false);
      expect(decision.criteria?.[0]).toMatchObject({
        status: "not_met",
        explanation: "Studies another topic.",
      });
    }
  });

  it("lines up checks numbered from 0 with the right criteria", () => {
    const decision = decideScreening(
      {
        isIncluded: true,
        reason: "Fits.",
        criteria: CRITERIA.map((_, i) => ({
          criterion: i,
          status: i === 0 ? "not_met" : "met",
          explanation: `Check ${i}.`,
        })),
      },
      CRITERIA
    );

    expect(decision.isIncluded).toBe(false);
    expect(decision.criteria?.map((c) => c.status)).toEqual(
      CRITERIA.map((_, i) => (i === 0 ? "not_met" : "met"))
    );
    expect(decision.reason).toContain(CRITERIA[0].label);
  });

  it("respects the screener's exclusion even when every criterion is marked met", () => {
    const decision = decideScreening(
      { isIncluded: false, reason: "A duplicate of another record.", criteria: allMet },
      CRITERIA
    );

    expect(decision.isIncluded).toBe(false);
    expect(decision.reason).toBe("A duplicate of another record.");
  });

  it("excludes a paper whose abstract leaves most criteria unclear", () => {
    const decision = decideScreening(
      {
        isIncluded: true,
        reason: "Seems related.",
        criteria: [
          { criterion: 1, status: "met", explanation: "On topic." },
          { criterion: 2, status: "unclear", explanation: "Abstract does not say." },
          { criterion: 3, status: "unclear", explanation: "Abstract does not say." },
        ],
      },
      CRITERIA
    );

    expect(decision.isIncluded).toBe(false);
    expect(decision.reason).toMatch(/not enough/i);
  });

  it("includes a paper with only a minority of criteria unclear", () => {
    const decision = decideScreening(
      {
        isIncluded: true,
        reason: "Relevant.",
        criteria: [
          { criterion: 1, status: "met", explanation: "On topic." },
          { criterion: 2, status: "met", explanation: "Has experiments." },
          { criterion: 3, status: "unclear", explanation: "Not stated." },
        ],
      },
      CRITERIA
    );

    expect(decision.isIncluded).toBe(true);
  });

  it("keeps an exclusion that came without per-criterion checks", () => {
    const excluded = decideScreening(
      { isIncluded: false, reason: "Off topic.", criteria: [] },
      CRITERIA
    );

    expect(excluded.isIncluded).toBe(false);
    expect(excluded.reason).toBe("Off topic.");
  });

  it("never includes a paper without per-criterion checks", () => {
    for (const response of [
      { isIncluded: true, reason: "Relevant." },
      { isIncluded: true, reason: "Relevant.", criteria: [] },
    ]) {
      const decision = decideScreening(response, CRITERIA);

      expect(decision.isIncluded).toBe(false);
      expect(decision.criteria?.every((c) => c.status === "unclear")).toBe(true);
    }
  });

  it("matches checks to criteria by number and marks unanswered ones unclear", () => {
    const decision = decideScreening(
      {
        isIncluded: true,
        reason: "Relevant.",
        criteria: [
          { criterion: 2, status: "met", explanation: "Has experiments." },
          { criterion: 1, status: "met", explanation: "On topic." },
          { criterion: 9, status: "not_met", explanation: "Out of range, ignored." },
        ],
      },
      CRITERIA
    );

    expect(decision.criteria).toEqual([
      { label: "On topic", status: "met", explanation: "On topic." },
      { label: "Empirical evidence", status: "met", explanation: "Has experiments." },
      { label: "Comparison", status: "unclear", explanation: "Not assessed." },
    ]);
    expect(decision.isIncluded).toBe(true);
  });

  it("writes a reason when the screener left it blank", () => {
    const decision = decideScreening(
      { isIncluded: true, reason: "  ", criteria: allMet },
      CRITERIA
    );

    expect(decision.reason.length).toBeGreaterThan(0);
  });
});

describe("screeningFailureDecision", () => {
  it("excludes the paper, says why, and flags the failure", () => {
    const decision = screeningFailureDecision();

    expect(decision.isIncluded).toBe(false);
    expect(decision.screeningFailed).toBe(true);
    expect(decision.reason).toMatch(/could not be screened/i);
  });
});

describe("resolveScreeningDecisions", () => {
  it("excludes papers that got no decision instead of including them", () => {
    const decisions = new Map([[0, { isIncluded: true, reason: "Relevant." }]]);

    const result = resolveScreeningDecisions(2, decisions);

    expect(result.decisions[0]).toEqual({ isIncluded: true, reason: "Relevant." });
    expect(result.decisions[1].isIncluded).toBe(false);
    expect(result.decisions[1].screeningFailed).toBe(true);
    expect(result.includedCount).toBe(1);
    expect(result.excludedCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it("counts failed screenings", () => {
    const decisions = new Map([
      [0, screeningFailureDecision()],
      [1, screeningFailureDecision()],
    ]);

    const result = resolveScreeningDecisions(2, decisions);

    expect(result.failedCount).toBe(2);
    expect(result.includedCount).toBe(0);
  });
});
