/**
 * Source-specific evaluation fixtures.
 *
 * These fixtures are designed to test whether the chat agent correctly
 * utilizes different search sources (academic, web, finance, news) when
 * they are enabled via sourcePolicy.
 */
import type { EvalFixture } from "../types";

/** Notebook ID used for source test fixtures (ML course notebook) */
const SOURCE_TEST_NOTEBOOK_ID = "jd72h9qsq5zap11ede5k8rqkx585djmc";

// ============================================================
// Academic Source Tests
// ============================================================

export const academicFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "academic-transformer-architecture",
    question:
      "What are the key architectural innovations in the Transformer model introduced in the 'Attention Is All You Need' paper?",
    expectedItems: [
      "self-attention",
      "multi-head attention",
      "positional encoding",
      "feed-forward network",
      "encoder-decoder",
    ],
    expectedBehavior:
      "Answer should mention key innovations from the original Transformer paper including self-attention mechanism, multi-head attention, positional encodings, and the encoder-decoder architecture.",
    runner: "chat",
    notebookId: SOURCE_TEST_NOTEBOOK_ID,
    tags: ["academic", "research", "nlp", "source-test"],
    scenarioCategory: "factoid",
    sourcePolicy: { channels: ["academic"] },
  },
  {
    schemaVersion: 1,
    id: "academic-recent-llm",
    question:
      "What are the main differences between GPT-4 and GPT-3.5 in terms of model architecture and capabilities?",
    expectedItems: ["multimodal", "larger context window", "RLHF", "improved reasoning"],
    expectedBehavior:
      "Answer should discuss architectural and capability differences between GPT-4 and GPT-3.5, potentially citing relevant research papers or technical reports.",
    runner: "chat",
    notebookId: SOURCE_TEST_NOTEBOOK_ID,
    tags: ["academic", "research", "llm", "source-test"],
    scenarioCategory: "comparison",
    sourcePolicy: { channels: ["academic"] },
  },
];

// ============================================================
// Web Source Tests
// ============================================================

export const webFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "web-react-best-practices",
    question:
      "What are the current best practices for state management in React applications in 2024?",
    expectedItems: ["hooks", "Context API", "Redux", "Zustand", "server state"],
    expectedBehavior:
      "Answer should discuss modern React state management approaches including built-in hooks, Context API, and popular libraries like Redux, Zustand, or TanStack Query.",
    runner: "chat",
    notebookId: SOURCE_TEST_NOTEBOOK_ID,
    tags: ["web", "programming", "react", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["web"] },
  },
  {
    schemaVersion: 1,
    id: "web-cloud-comparison",
    question:
      "What are the main differences between AWS Lambda and Google Cloud Functions for serverless computing?",
    expectedItems: ["cold start", "pricing", "triggers", "runtime support", "concurrency"],
    expectedBehavior:
      "Answer should compare AWS Lambda and Google Cloud Functions across multiple dimensions including cold start performance, pricing models, supported triggers, runtime languages, and concurrency limits.",
    runner: "chat",
    notebookId: SOURCE_TEST_NOTEBOOK_ID,
    tags: ["web", "cloud", "serverless", "source-test"],
    scenarioCategory: "comparison",
    sourcePolicy: { channels: ["web"] },
  },
];

// ============================================================
// Finance Source Tests
// ============================================================

export const financeFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "finance-market-analysis",
    question:
      "What is the current market sentiment for tech stocks and what factors are driving recent price movements?",
    expectedItems: ["tech stocks", "market", "AI", "interest rates", "bubble"],
    expectedBehavior:
      "Answer should discuss current market sentiment for technology stocks, mentioning market conditions, AI investment impact, interest rate decisions, and whether analysts see a bubble forming.",
    runner: "chat",
    notebookId: SOURCE_TEST_NOTEBOOK_ID,
    tags: ["finance", "market-analysis", "tech-stocks", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["finance"] },
  },
  {
    schemaVersion: 1,
    id: "finance-crypto-trends",
    question: "What are the latest trends in cryptocurrency regulation and institutional adoption?",
    expectedItems: ["SEC", "ETF", "regulation", "institutional", "adoption"],
    expectedBehavior:
      "Answer should discuss recent regulatory developments (e.g., SEC actions), approval of cryptocurrency ETFs, and trends in institutional adoption of digital assets.",
    runner: "chat",
    notebookId: SOURCE_TEST_NOTEBOOK_ID,
    tags: ["finance", "crypto", "regulation", "source-test"],
    scenarioCategory: "temporal",
    sourcePolicy: { channels: ["finance"] },
  },
];

// ============================================================
// News Source Tests
// ============================================================

export const newsFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "news-ai-regulation",
    question:
      "What are the latest developments in AI regulation in the European Union and United States?",
    expectedItems: ["AI Act", "regulation", "rules", "negotiations", "exemptions"],
    expectedBehavior:
      "Answer should cover recent regulatory developments including the AI Act, stalled negotiations, exemptions, and rules being discussed in the EU and US.",
    runner: "chat",
    notebookId: SOURCE_TEST_NOTEBOOK_ID,
    tags: ["news", "ai", "regulation", "policy", "source-test"],
    scenarioCategory: "temporal",
    sourcePolicy: { channels: ["news"] },
  },
  {
    schemaVersion: 1,
    id: "news-climate-tech",
    question:
      "What recent breakthroughs have been announced in climate technology and clean energy?",
    expectedItems: ["renewable energy", "battery technology", "carbon capture", "solar", "wind"],
    expectedBehavior:
      "Answer should discuss recent announcements and developments in climate technology including advances in renewable energy, battery storage, carbon capture, and clean energy deployment.",
    runner: "chat",
    notebookId: SOURCE_TEST_NOTEBOOK_ID,
    tags: ["news", "climate", "technology", "clean-energy", "source-test"],
    scenarioCategory: "temporal",
    sourcePolicy: { channels: ["news"] },
  },
];

// ============================================================
// Cross-Source Comparison Tests
// ============================================================

export const crossSourceFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "cross-source-quantum-computing",
    question:
      "What are the latest developments in quantum computing and when might practical applications emerge?",
    expectedItems: ["qubits", "error correction", "applications", "timeline", "challenges"],
    expectedBehavior:
      "Answer should combine recent research findings (academic) with current industry news and market analysis about quantum computing commercialization timeline.",
    runner: "chat",
    notebookId: SOURCE_TEST_NOTEBOOK_ID,
    tags: ["cross-source", "quantum", "research", "industry", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["academic", "news", "web"] },
  },
  {
    schemaVersion: 1,
    id: "cross-source-biotech",
    question:
      "How are CRISPR gene editing technologies being applied in medicine and what recent clinical trials show promise?",
    expectedItems: ["CRISPR", "gene therapy", "clinical trials", "FDA", "applications"],
    expectedBehavior:
      "Answer should combine scientific research (academic sources) with recent clinical trial results and regulatory news to provide a comprehensive overview of CRISPR medical applications.",
    runner: "chat",
    notebookId: SOURCE_TEST_NOTEBOOK_ID,
    tags: ["cross-source", "biotech", "crispr", "medicine", "source-test"],
    scenarioCategory: "explanation",
    sourcePolicy: { channels: ["academic", "news", "web"] },
  },
];

// ============================================================
// All Source Test Fixtures
// ============================================================

export const allSourceFixtures: EvalFixture[] = [
  ...academicFixtures,
  ...webFixtures,
  ...financeFixtures,
  ...newsFixtures,
  ...crossSourceFixtures,
];
