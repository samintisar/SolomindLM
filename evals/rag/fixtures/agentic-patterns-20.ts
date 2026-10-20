import type { EvalFixture } from "../types";

/**
 * The canonical list of 20 agentic AI design patterns covered in the test
 * notebook source ([sources/master-20-agentic-patterns.md](./sources/master-20-agentic-patterns.md)).
 * Reused as ground-truth across chat and studio fixtures pinned to notebook
 * `jd702jq641ensjca91c9hwp4d985pgax`.
 */
export const AGENTIC_20_ITEMS: readonly string[] = [
  "prompt chaining",
  "routing",
  "parallelization",
  "reflection",
  "tool use",
  "planning",
  "multi-agent collaboration",
  "memory management",
  "learning and adaptation",
  "goal setting and monitoring",
  "exception handling and recovery",
  "human in the loop",
  "knowledge retrieval",
  "inter-agent communication",
  "resource-aware optimization",
  "reasoning techniques",
  "evaluation and monitoring",
  "guardrails and safety patterns",
  "prioritization",
  "exploration and discovery",
];

/** Local copy of the notebook's source, for judges that need the full text. */
export const AGENTIC_20_SOURCE_FILES: readonly string[] = ["master-20-agentic-patterns.md"];

/** Notebook ID of the test notebook backed by the 20-patterns markdown source. */
export const AGENTIC_20_NOTEBOOK_ID = "jd702jq641ensjca91c9hwp4d985pgax";

/** Substring matched against document `fileName` to scope evals to the patterns source. */
const AGENTIC_20_DOCUMENT_TITLE_HINT = "agentic";

/** Shared studio eval params so jobs ignore unrelated docs in the same notebook. */
export const AGENTIC_20_STUDIO_PARAMS = {
  documentTitleHint: AGENTIC_20_DOCUMENT_TITLE_HINT,
} as const;

/**
 * Golden eval fixture: "What are the 20 agentic patterns?"
 *
 * Based on a real transcript where the chat agent failed to enumerate
 * the full list despite the information being present in notebook sources.
 * This fixture validates that retrieval + context selection + answer
 * generation can surface and enumerate all 20 items.
 */
export const agenticPatterns20: EvalFixture = {
  schemaVersion: 1,
  id: "agentic-patterns-20",
  split: "smoke",
  question: "What are the 20 agentic patterns?",
  expectedItems: [...AGENTIC_20_ITEMS],
  // Gold passages (D1): one from the start, the middle and the end of the transcript.
  expectedPassages: [
    "And the first one we're starting with is prompt chaining.",
    "This next pattern might be new to a lot of you and it's called resourceaware optimization.",
    "This is the second last design pattern which is prioritization.",
  ],
  expectedBehavior:
    "Answer should enumerate all 20 items and cite supporting chunks. " +
    "Must NOT say the list cannot be found or that fewer than 20 patterns exist. " +
    "Each pattern should be named clearly, matching the expected items list.",
  runner: "chat",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  tags: ["list-enumeration", "agentic-patterns", "retrieval-coverage"],
};
