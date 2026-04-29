/**
 * Template and helper for creating RAG eval fixtures from Q&A pairs.
 *
 * Usage:
 * 1. Copy this template and fill in your Q&A pairs
 * 2. Import and add to FIXTURES registry in index.ts
 * 3. Run eval with your new fixture
 */

import type { EvalFixture } from "../types";
import type { ScenarioCategory } from "./scenarioCategories";

// ─── Template Function ───────────────────────────────────────────

/**
 * Create a fixture from a Q&A pair.
 *
 * @param params - Fixture parameters
 * @returns A complete EvalFixture object
 */
export function createFixture(params: {
  /** Unique ID (e.g., "ml-backprop-001") */
  id: string;

  /** The user question */
  question: string;

  /**
   * Expected answer text (required for LLM judge scenarios).
   * Use this for prose answers, explanations, comparisons.
   */
  expectedAnswer: string;

  /**
   * Optional: specific items that must appear (for deterministic metrics).
   * Use this for list-enumeration or factoid scenarios.
   */
  expectedItems?: string[];

  /**
   * Higher-level behavioral expectation.
   * Describe what a good answer should accomplish.
   */
  expectedBehavior?: string;

  /**
   * Notebook ID to scope retrieval.
   * Get this from the Convex dashboard or your app URL.
   */
  notebookId: string;

  /**
   * Scenario category (inferred from tags if not provided).
   * Controls which metrics are prioritized.
   */
  scenarioCategory?: ScenarioCategory;

  /**
   * Additional tags for grouping.
   * Category tag is added automatically if not present.
   */
  tags?: string[];

  /**
   * Which runner(s) to test against.
   * "both" runs the fixture through both chat and research runners.
   */
  runner?: "chat" | "research" | "both";

  /**
   * Schema version (bump if fixture structure changes).
   * Defaults to 1.
   */
  schemaVersion?: number;
}): EvalFixture {
  const {
    id,
    question,
    expectedAnswer,
    expectedItems = [],
    expectedBehavior = "Answer should accurately address the question using retrieved context.",
    notebookId,
    scenarioCategory,
    tags = [],
    runner = "chat",
    schemaVersion = 1,
  } = params;

  // Auto-infer category from tags if not explicitly set
  const finalCategory = scenarioCategory ?? inferCategoryFromTags(tags, question);
  const finalTags = tags.includes(finalCategory) ? tags : [...tags, finalCategory];

  return {
    schemaVersion,
    id,
    question,
    expectedItems,
    expectedAnswer,
    expectedBehavior,
    notebookId,
    tags: finalTags,
    runner,
    scenarioCategory: finalCategory,
  };
}

function inferCategoryFromTags(tags: string[], question: string): ScenarioCategory {
  // Check explicit category tag
  const categories: ScenarioCategory[] = [
    "factoid",
    "list-enumeration",
    "comparison",
    "causality",
    "temporal",
    "ambiguous",
    "multi-doc",
    "technical",
    "summarization",
    "explanation",
  ];

  for (const cat of categories) {
    if (tags.includes(cat)) return cat;
  }

  // Infer from question
  const q = question.toLowerCase();
  if (/what are the \d+|list all|enumerate/i.test(q)) return "list-enumeration";
  if (/compare|difference|versus|vs\.|contrast/i.test(q)) return "comparison";
  if (/why|cause|because|leads to|result in/i.test(q)) return "causality";
  if (/when|timeline|chronological|order|first|introduced/i.test(q)) return "temporal";
  if (/summarize|main points|key takeaways|overview/i.test(q)) return "summarization";
  if (/how does .* work|explain|describe in detail/i.test(q)) return "explanation";

  return "factoid"; // default
}

// ─── Example: How to define your fixtures ────────────────────────

/**
 * Example fixture showing the pattern.
 * Replace this with your actual Q&A pairs.
 */

export const exampleMlFixture = createFixture({
  id: "ml-transformer-attention-001",
  question: "How does the self-attention mechanism in transformers work?",
  expectedAnswer: `Self-attention computes relationships between all positions in a sequence.
For each token, it calculates three vectors: Query (Q), Key (K), and Value (V).
The attention score is computed as softmax(QK^T / sqrt(d_k)) * V.
This allows each token to attend to all other tokens weighted by relevance.`,

  expectedBehavior: `Answer should explain Q/K/V computation, the attention formula,
and why scaled dot-product attention is used. Should mention the role of
softmax and the scaling factor 1/sqrt(d_k).`,

  notebookId: "your-machine-learning-notebook-id",
  tags: ["technical", "explanation", "ml"],
  runner: "chat",
});

// ─── Batch Creation Helper ────────────────────────────────────────

/**
 * Create multiple fixtures from Q&A pairs sharing a notebook.
 */
export function createFixtureBatch(params: {
  /** Prefix for all fixture IDs (e.g., "ml-") */
  idPrefix: string;

  /** Notebook ID shared by all fixtures */
  notebookId: string;

  /** Default scenario category */
  scenarioCategory?: ScenarioCategory;

  /** Default tags (added to all fixtures) */
  defaultTags?: string[];

  /** Q&A pairs */
  qaPairs: Array<{
    question: string;
    expectedAnswer: string;
    expectedItems?: string[];
    expectedBehavior?: string;
    tags?: string[];
  }>;

  /** Default runner */
  runner?: "chat" | "research" | "both";
}): EvalFixture[] {
  const {
    idPrefix,
    notebookId,
    scenarioCategory,
    defaultTags = [],
    qaPairs,
    runner = "chat",
  } = params;

  return qaPairs.map((qa, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    return createFixture({
      id: `${idPrefix}${suffix}`,
      question: qa.question,
      expectedAnswer: qa.expectedAnswer,
      expectedItems: qa.expectedItems,
      expectedBehavior: qa.expectedBehavior,
      notebookId,
      scenarioCategory,
      tags: [...defaultTags, ...(qa.tags ?? [])],
      runner,
    });
  });
}

/**
 * Example batch creation.
 *
 * const mlFixtures = createFixtureBatch({
 *   idPrefix: "ml-basic-",
 *   notebookId: "your-ml-notebook-id",
 *   scenarioCategory: "technical",
 *   defaultTags: ["ml", "foundational"],
 *   qaPairs: [
 *     {
 *       question: "What is overfitting?",
 *       expectedAnswer: "Overfitting occurs when a model learns the training data too well...",
 *       expectedBehavior: "Should mention training vs validation performance, generalization gap.",
 *     },
 *     {
 *       question: "Explain gradient descent.",
 *       expectedAnswer: "Gradient descent is an optimization algorithm that iteratively adjusts weights...",
 *       expectedBehavior: "Should explain the gradient, learning rate, and iterative update process.",
 *     },
 *   ],
 * });
 */
