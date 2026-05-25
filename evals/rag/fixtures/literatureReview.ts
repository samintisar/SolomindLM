/**
 * Literature review evaluation fixtures.
 * Runner: "literatureReview"
 */
import type { EvalFixture } from "../types";

const LITERATURE_REVIEW_NOTEBOOK_ID = "jd72h9qsq5zap11ede5k8rqkx585djmc";

export const literatureReviewFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "literature-review-001-rag-evaluation",
    question: "What methods are used to evaluate retrieval augmented generation systems?",
    expectedItems: [
      "retrieval",
      "evaluation",
      "faithfulness",
      "answer relevance",
      "context relevance",
    ],
    expectedBehavior:
      "Should search for academic sources, screen relevant papers, extract a table, and generate a narrative literature review report.",
    runner: "literatureReview",
    notebookId: LITERATURE_REVIEW_NOTEBOOK_ID,
    tags: ["literature-review", "rag", "evaluation"],
    scenarioCategory: "summarization",
    expectedStructure: {
      minItems: 1,
      requiredSections: [
        "Abstract",
        "Introduction",
        "Methods",
        "Results",
        "Discussion",
        "Conclusion",
      ],
    },
  },
  {
    schemaVersion: 1,
    id: "literature-review-002-clinical-trial-design",
    question: "What are adaptive clinical trial designs and when are they used?",
    expectedItems: ["adaptive", "interim analysis", "randomization", "efficiency"],
    expectedBehavior:
      "Should find medical literature on adaptive clinical trials, explain the concept, and discuss when they are appropriate.",
    runner: "literatureReview",
    notebookId: LITERATURE_REVIEW_NOTEBOOK_ID,
    tags: ["literature-review", "clinical-trials", "medicine"],
    scenarioCategory: "explanation",
    expectedStructure: {
      minItems: 1,
      requiredSections: [
        "Abstract",
        "Introduction",
        "Methods",
        "Results",
        "Discussion",
        "Conclusion",
      ],
    },
  },
  {
    schemaVersion: 1,
    id: "literature-review-003-climate-carbon-capture",
    question:
      "What direct air capture technologies exist for removing carbon dioxide from the atmosphere?",
    expectedItems: ["direct air capture", "DAC", "carbon dioxide", "sorbent"],
    expectedBehavior:
      "Should survey engineering and chemistry literature on direct air capture, describing different technological approaches.",
    runner: "literatureReview",
    notebookId: LITERATURE_REVIEW_NOTEBOOK_ID,
    tags: ["literature-review", "climate", "carbon-capture"],
    scenarioCategory: "summarization",
    expectedStructure: {
      minItems: 1,
      requiredSections: [
        "Abstract",
        "Introduction",
        "Methods",
        "Results",
        "Discussion",
        "Conclusion",
      ],
    },
  },
  {
    schemaVersion: 1,
    id: "literature-review-004-transformer-efficiency",
    question: "How do efficient transformer architectures reduce computational complexity?",
    expectedItems: ["linear attention", "sparse attention", "FlashAttention", "complexity"],
    expectedBehavior:
      "Should find CS/ML papers on efficient transformers and compare approaches to reducing quadratic complexity.",
    runner: "literatureReview",
    notebookId: LITERATURE_REVIEW_NOTEBOOK_ID,
    tags: ["literature-review", "transformers", "efficiency"],
    scenarioCategory: "comparison",
    expectedStructure: {
      minItems: 1,
      requiredSections: [
        "Abstract",
        "Introduction",
        "Methods",
        "Results",
        "Discussion",
        "Conclusion",
      ],
    },
  },
  {
    schemaVersion: 1,
    id: "literature-review-005-mental-health-digital",
    question: "What digital interventions exist for treating depression?",
    expectedItems: ["CBT", "app", "smartphone", "depression", "RCT"],
    expectedBehavior:
      "Should find health psychology and psychiatry literature on digital mental health interventions for depression.",
    runner: "literatureReview",
    notebookId: LITERATURE_REVIEW_NOTEBOOK_ID,
    tags: ["literature-review", "mental-health", "digital-health"],
    scenarioCategory: "summarization",
    expectedStructure: {
      minItems: 1,
      requiredSections: [
        "Abstract",
        "Introduction",
        "Methods",
        "Results",
        "Discussion",
        "Conclusion",
      ],
    },
  },
];
