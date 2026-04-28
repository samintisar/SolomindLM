import type { EvalFixture } from "../types";

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
  question: "What are the 20 agentic patterns?",
  expectedItems: [
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
  ],
  expectedBehavior:
    "Answer should enumerate all 20 items and cite supporting chunks. " +
    "Must NOT say the list cannot be found or that fewer than 20 patterns exist. " +
    "Each pattern should be named clearly, matching the expected items list.",
  runner: "chat",
  notebookId: "jd702jq641ensjca91c9hwp4d985pgax",
  tags: ["list-enumeration", "agentic-patterns", "retrieval-coverage"],
};
