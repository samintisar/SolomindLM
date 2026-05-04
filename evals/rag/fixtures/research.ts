/**
 * Research evaluation fixtures for the deep research agent.
 * Runner: "research"
 * Notebook: jd72h9qsq5zap11ede5k8rqkx585djmc
 */
import type { EvalFixture } from "../types";

const RESEARCH_NOTEBOOK_ID = "jd72h9qsq5zap11ede5k8rqkx585djmc";

export const researchFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "research-001-inflation-factors",
    question:
      "What are the main factors driving inflation in modern economies, and how do central banks typically respond?",
    expectedItems: ["inflation", "central banks", "monetary policy", "interest rates", "economies"],
    expectedBehavior:
      "Should decompose into sub-questions covering inflation causes and central bank responses. Should retrieve evidence from multiple sources.",
    runner: "research",
    notebookId: RESEARCH_NOTEBOOK_ID,
    tags: ["research", "economics", "multi-causal", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["notebook", "web", "academic"] },
  },
  {
    schemaVersion: 1,
    id: "research-002-transformer-vs-rnn",
    question:
      "How does transformer architecture differ from recurrent neural networks, and what are the tradeoffs for sequence modeling tasks?",
    expectedItems: [
      "transformer",
      "recurrent neural networks",
      "RNN",
      "attention",
      "sequence modeling",
    ],
    expectedBehavior:
      "Should compare transformers and RNNs, discussing architecture differences and tradeoffs for sequence tasks.",
    runner: "research",
    notebookId: RESEARCH_NOTEBOOK_ID,
    tags: ["research", "machine-learning", "comparison", "source-test"],
    scenarioCategory: "comparison",
    sourcePolicy: { channels: ["notebook", "web", "academic"] },
  },
  {
    schemaVersion: 1,
    id: "research-003-llm-hallucination",
    question:
      "What are the most promising approaches to making large language models more reliable and less prone to hallucination?",
    expectedItems: [
      "hallucination",
      "large language models",
      "reliability",
      "training",
      "alignment",
    ],
    expectedBehavior:
      "Should explore multiple approaches to reducing hallucinations including training techniques, alignment methods, and retrieval augmentation.",
    runner: "research",
    notebookId: RESEARCH_NOTEBOOK_ID,
    tags: ["research", "llm", "synthesis", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["notebook", "web", "academic"] },
  },
  {
    schemaVersion: 1,
    id: "research-004-quantum-computing",
    question:
      "What has changed in quantum computing capabilities over the past two years, and where does the field stand today?",
    expectedItems: [
      "quantum computing",
      "qubits",
      "error correction",
      "applications",
      "breakthroughs",
    ],
    expectedBehavior:
      "Should cover recent developments in quantum computing including hardware advances, error correction progress, and current capabilities.",
    runner: "research",
    notebookId: RESEARCH_NOTEBOOK_ID,
    tags: ["research", "quantum", "temporal", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["web", "news", "academic"] },
  },
  {
    schemaVersion: 1,
    id: "research-005-intermittent-fasting",
    question:
      "Is intermittent fasting actually effective for long-term weight loss, and what does the evidence say?",
    expectedItems: ["intermittent fasting", "weight loss", "evidence", "studies", "metabolism"],
    expectedBehavior:
      "Should examine contradictory evidence, analyze studies on intermittent fasting effectiveness, and discuss metabolic impacts.",
    runner: "research",
    notebookId: RESEARCH_NOTEBOOK_ID,
    tags: ["research", "health", "contradictory-evidence", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["web", "academic"] },
  },
  {
    schemaVersion: 1,
    id: "research-006-crispr-mechanism",
    question: "How does the CRISPR-Cas9 gene editing mechanism work at a molecular level?",
    expectedItems: ["CRISPR", "Cas9", "gene editing", "DNA", "molecular"],
    expectedBehavior:
      "Should explain the CRISPR-Cas9 mechanism in detail without over-fragmenting into too many sub-questions.",
    runner: "research",
    notebookId: RESEARCH_NOTEBOOK_ID,
    tags: ["research", "biology", "deep-explanation", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["notebook", "web", "academic"] },
  },
  {
    schemaVersion: 1,
    id: "research-007-2008-financial-crisis",
    question:
      "How did the 2008 financial crisis develop, and what regulatory changes did it trigger?",
    expectedItems: ["2008", "financial crisis", "regulatory changes", "banking", "reforms"],
    expectedBehavior:
      "Should trace the crisis development and identify key regulatory reforms that followed.",
    runner: "research",
    notebookId: RESEARCH_NOTEBOOK_ID,
    tags: ["research", "finance", "chained-reasoning", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["notebook", "web", "academic"] },
  },
  {
    schemaVersion: 1,
    id: "research-008-notebook-only",
    question:
      "Based on the available sources, what are the key arguments presented about this topic?",
    expectedItems: ["arguments", "sources", "evidence", "claims", "supporting"],
    expectedBehavior:
      "Should retrieve and synthesize information exclusively from notebook sources without using external search.",
    runner: "research",
    notebookId: RESEARCH_NOTEBOOK_ID,
    documentIds: ["eval-doc-001", "eval-doc-002"],
    tags: ["research", "notebook-only", "source-isolation", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["notebook"] },
  },
  {
    schemaVersion: 1,
    id: "research-009-ml-learning-path",
    question:
      "what should I learn about Neural Networks, CNNs, RNNs and transformers to take me to the next stage of machine learning?",
    expectedItems: [
      "neural networks",
      "CNN",
      "RNN",
      "transformers",
      "learning path",
      "machine learning",
    ],
    expectedBehavior:
      "Should provide a structured learning roadmap covering neural network fundamentals, CNNs for vision, RNNs for sequences, and transformers for modern NLP, with prerequisite knowledge and progression path.",
    runner: "research",
    notebookId: RESEARCH_NOTEBOOK_ID,
    tags: ["research", "machine-learning", "learning-path", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["web", "academic"] },
  },
];
