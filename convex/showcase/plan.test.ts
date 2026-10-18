import { describe, expect, test } from "vitest";
import type { ShowcaseNotebook } from "./manifest";
import {
  BUSY_TICK_MS,
  discoveryOutcome,
  MAX_TICKS,
  nextTickDelay,
  planSeed,
  type SeedPlan,
  type SeedSnapshot,
  tickGate,
  WAIT_TICK_MS,
} from "./plan";

const NOTEBOOK: ShowcaseNotebook = {
  slug: "test-notebook",
  title: "Test Notebook",
  icon: "Book",
  coverColor: "bg-vintage-blue-300",
  sources: [
    { kind: "url", title: "Page", url: "https://example.org/a", licence: "CC BY-SA 4.0" },
    { kind: "text", title: "Notes", text: "x".repeat(600), licence: "Original" },
  ],
  studio: [
    { kind: "flashcards", cardCount: 35, difficulty: "medium" },
    { kind: "quiz", questionCount: 10, difficulty: "easy" },
    { kind: "flashcards", cardCount: 20, difficulty: "hard" },
  ],
};

const REVIEW_NOTEBOOK: ShowcaseNotebook = {
  slug: "review",
  title: "Review",
  icon: "Search",
  coverColor: "bg-vintage-green-400",
  sources: [],
  paperDiscovery: { query: "spacing effect", filters: {}, take: 2 },
  studio: [],
  literatureReview: { question: "Does spacing work?", researchDatabase: "all" },
  deepResearch: { query: "How should reviews be scheduled?", channels: ["notebook", "academic"] },
};

const EMPTY: SeedSnapshot = {
  notebookExists: true,
  isPublic: false,
  isFeatured: false,
  sources: [],
  studio: [],
  literatureReview: null,
  deepResearch: null,
};

const READY_SOURCES: SeedSnapshot["sources"] = [
  { key: "https://example.org/a", title: "Page", fileType: "url", status: "completed" },
  { key: "Notes", title: "Notes", fileType: "text", status: "completed" },
];

const PAPERS: SeedSnapshot["sources"] = [
  { key: "doi:10.1/a", title: "Paper A", fileType: "paper_record", status: "completed" },
  { key: "doi:10.1/b", title: "Paper B", fileType: "paper_record", status: "completed" },
];

const done = (kind: "flashcards" | "quiz", title: string = kind) => ({
  kind,
  title,
  status: "completed",
});
const opts = { maxInFlight: 2, publish: false };

describe("planSeed: notebook and sources", () => {
  test("creates the notebook first", () => {
    expect(planSeed(NOTEBOOK, { ...EMPTY, notebookExists: false }, opts)).toEqual({
      state: "working",
      steps: [{ type: "createNotebook" }],
      waitingOn: [],
      problems: [],
    });
  });

  test("adds missing sources and generates nothing until every source is read", () => {
    const plan = planSeed(
      NOTEBOOK,
      { ...EMPTY, sources: [{ ...READY_SOURCES[0], status: "processing" }] },
      opts
    );
    expect(plan.steps).toEqual([{ type: "addSource", sourceIndex: 1 }]);
    expect(plan.waitingOn).toEqual(["1 source(s) ingesting"]);
  });

  test("a failed source blocks generation", () => {
    const plan = planSeed(
      NOTEBOOK,
      { ...EMPTY, sources: [{ ...READY_SOURCES[0], status: "failed" }, READY_SOURCES[1]] },
      opts
    );
    expect(plan.state).toBe("blocked");
    expect(plan.problems).toEqual([
      'Source "Page" failed to ingest. Delete it in the app, then re-run the seed.',
    ]);
  });

  test("discovers the papers still missing", () => {
    const plan = planSeed(REVIEW_NOTEBOOK, { ...EMPTY, sources: [PAPERS[0]] }, opts);
    expect(plan.steps).toEqual([{ type: "discoverPapers", needed: 1 }]);
  });
});

describe("planSeed: Studio items", () => {
  test("starts items in manifest order up to maxInFlight", () => {
    const plan = planSeed(NOTEBOOK, { ...EMPTY, sources: READY_SOURCES }, opts);
    expect(plan.steps).toEqual([
      { type: "startStudioItem", itemIndex: 0 },
      { type: "startStudioItem", itemIndex: 1 },
    ]);
    expect(plan.waitingOn).toEqual(["1 item(s) queued behind running jobs"]);
  });

  test("running items use up slots", () => {
    const plan = planSeed(
      NOTEBOOK,
      {
        ...EMPTY,
        sources: READY_SOURCES,
        studio: [{ kind: "flashcards", title: "Flashcards", status: "generating" }],
      },
      opts
    );
    expect(plan.steps).toEqual([{ type: "startStudioItem", itemIndex: 1 }]);
    expect(plan.waitingOn).toEqual([
      'flashcards "Flashcards" generating',
      "1 item(s) queued behind running jobs",
    ]);
  });

  test("matches items of a kind by count, so finished items are never restarted", () => {
    const plan = planSeed(
      NOTEBOOK,
      {
        ...EMPTY,
        sources: READY_SOURCES,
        studio: [done("flashcards", "Deck 1"), done("quiz"), done("flashcards", "Deck 2")],
      },
      opts
    );
    expect(plan).toEqual({ state: "done", steps: [], waitingOn: [], problems: [] });
  });

  test("a failed item is reported and not retried", () => {
    const plan = planSeed(
      NOTEBOOK,
      {
        ...EMPTY,
        sources: READY_SOURCES,
        studio: [
          { kind: "flashcards", title: "Deck 1", status: "failed" },
          done("quiz"),
          done("flashcards", "Deck 2"),
        ],
      },
      opts
    );
    expect(plan.state).toBe("blocked");
    expect(plan.steps).toEqual([]);
    expect(plan.problems).toEqual([
      'flashcards "Deck 1" failed. Delete it in the app, then re-run the seed.',
    ]);
  });

  test("publishes a finished notebook only when asked, and only once", () => {
    const finished: SeedSnapshot = {
      ...EMPTY,
      sources: READY_SOURCES,
      studio: [done("flashcards"), done("quiz"), done("flashcards")],
    };
    expect(planSeed(NOTEBOOK, finished, { ...opts, publish: true }).steps).toEqual([
      { type: "publish" },
    ]);
    expect(
      planSeed(
        NOTEBOOK,
        { ...finished, isPublic: true, isFeatured: true },
        { ...opts, publish: true }
      ).state
    ).toBe("done");
  });
});

describe("planSeed: literature review and deep research", () => {
  const withPapers = { ...EMPTY, sources: PAPERS };
  const review = (
    status: string,
    extra: Partial<NonNullable<SeedSnapshot["literatureReview"]>> = {}
  ) => ({
    status,
    awaitingColumns: false,
    outputsInStudio: false,
    ...extra,
  });

  test("starts the review once the papers are read; deep research waits for it", () => {
    const plan = planSeed(REVIEW_NOTEBOOK, withPapers, opts);
    expect(plan.steps).toEqual([{ type: "startLiteratureReview" }]);
    expect(plan.waitingOn).toEqual(["deep research: waiting for the literature review"]);
  });

  test("confirms the suggested columns only when the workflow is waiting for them", () => {
    const waiting = planSeed(
      REVIEW_NOTEBOOK,
      { ...withPapers, literatureReview: review("awaiting_columns", { awaitingColumns: true }) },
      opts
    );
    expect(waiting.steps).toEqual([{ type: "confirmLiteratureReviewColumns" }]);
    const notYet = planSeed(
      REVIEW_NOTEBOOK,
      { ...withPapers, literatureReview: review("awaiting_columns") },
      opts
    );
    expect(notYet.steps).toEqual([]);
    expect(notYet.waitingOn).toContain("literature review: awaiting_columns");
  });

  test("copies a finished review into Studio, then starts deep research", () => {
    expect(
      planSeed(REVIEW_NOTEBOOK, { ...withPapers, literatureReview: review("completed") }, opts)
        .steps
    ).toEqual([{ type: "copyLiteratureReviewToStudio" }]);
    expect(
      planSeed(
        REVIEW_NOTEBOOK,
        { ...withPapers, literatureReview: review("completed", { outputsInStudio: true }) },
        opts
      ).steps
    ).toEqual([{ type: "startDeepResearch" }]);
  });

  test("a failed review blocks the notebook", () => {
    const plan = planSeed(
      REVIEW_NOTEBOOK,
      { ...withPapers, literatureReview: review("failed") },
      opts
    );
    expect(plan.state).toBe("blocked");
    expect(plan.problems).toEqual([
      "The literature review failed. Retry it from the notebook's chat, then re-run the seed.",
    ]);
  });

  test("approves the research plan, then waits for the report", () => {
    const base = {
      ...withPapers,
      literatureReview: review("completed", { outputsInStudio: true }),
    };
    expect(
      planSeed(
        REVIEW_NOTEBOOK,
        {
          ...base,
          deepResearch: {
            planStatus: "draft",
            awaitingApproval: true,
            runStatus: "pending",
            hasReport: false,
          },
        },
        opts
      ).steps
    ).toEqual([{ type: "approveDeepResearchPlan" }]);
    expect(
      planSeed(
        REVIEW_NOTEBOOK,
        {
          ...base,
          deepResearch: {
            planStatus: "approved",
            awaitingApproval: false,
            runStatus: "completed",
            hasReport: true,
          },
        },
        opts
      ).state
    ).toBe("done");
    expect(
      planSeed(
        REVIEW_NOTEBOOK,
        {
          ...base,
          deepResearch: {
            planStatus: "approved",
            awaitingApproval: false,
            runStatus: "completed",
            hasReport: false,
          },
        },
        opts
      ).state
    ).toBe("blocked");
  });
});

describe("tick decisions", () => {
  const plan = (over: Partial<SeedPlan>): SeedPlan => ({
    state: "working",
    steps: [],
    waitingOn: [],
    problems: [],
    ...over,
  });

  test("a chain stops when its notebook is done, blocked, or deleted mid-run", () => {
    expect(tickGate(plan({ state: "done" }), 3)).toEqual({ run: false, reason: "done" });
    expect(tickGate(plan({ state: "blocked", problems: ["x"] }), 3)).toEqual({
      run: false,
      reason: "blocked",
    });
    const create = plan({ steps: [{ type: "createNotebook" }] });
    expect(tickGate(create, 1)).toEqual({ run: true });
    expect(tickGate(create, 2)).toEqual({ run: false, reason: "notebook_gone" });
    expect(tickGate(plan({ waitingOn: ["1 source(s) ingesting"] }), 7)).toEqual({ run: true });
  });

  test("polls fast after starting work, slowly while waiting or backing off, and gives up", () => {
    expect(nextTickDelay({ tick: 1, ranSteps: 2, backedOff: false })).toBe(BUSY_TICK_MS);
    expect(nextTickDelay({ tick: 1, ranSteps: 0, backedOff: false })).toBe(WAIT_TICK_MS);
    expect(nextTickDelay({ tick: 1, ranSteps: 1, backedOff: true })).toBe(WAIT_TICK_MS);
    expect(nextTickDelay({ tick: MAX_TICKS - 1, ranSteps: 0, backedOff: false })).toBe(
      WAIT_TICK_MS
    );
    expect(nextTickDelay({ tick: MAX_TICKS, ranSteps: 0, backedOff: false })).toBeNull();
  });
});

describe("discoveryOutcome", () => {
  const base = { query: "spacing", pinned: false, searched: 20, resolved: 12, added: 0 };

  test("any new paper is progress", () => {
    expect(discoveryOutcome({ ...base, added: 2, rateLimited: true })).toEqual({
      kind: "added",
    });
  });

  test("a rate-limited search that added nothing backs off instead of failing", () => {
    expect(discoveryOutcome({ ...base, searched: 0, resolved: 0, rateLimited: true })).toEqual({
      kind: "backoff",
    });
  });

  test("asks to widen the search only when it found too few candidates", () => {
    const empty = discoveryOutcome({ ...base, searched: 0, resolved: 0, rateLimited: false });
    expect(empty).toEqual({
      kind: "error",
      message: 'Discovery for "spacing" found no papers; widen the query or filters',
    });
    const allKnown = discoveryOutcome({ ...base, rateLimited: false });
    expect(allKnown).toEqual({
      kind: "error",
      message:
        'Discovery for "spacing" found no papers that aren\'t already in the notebook; widen the query or filters',
    });
  });

  test("reports a DOI resolution failure separately", () => {
    expect(discoveryOutcome({ ...base, resolved: 0, rateLimited: false })).toEqual({
      kind: "error",
      message:
        'Discovery for "spacing" found 20 papers, but none resolved through the DOI resolver (no DOI, or the registries were unreachable); re-run later',
    });
    expect(
      discoveryOutcome({ ...base, pinned: true, searched: 5, resolved: 0, rateLimited: false })
    ).toEqual({
      kind: "error",
      message:
        "None of the 5 pinned DOIs resolved (check them, or the registries were unreachable); re-run later",
    });
  });
});
