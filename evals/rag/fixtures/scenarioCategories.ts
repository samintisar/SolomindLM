/**
 * Scenario categories for RAG evaluation.
 *
 * Each category represents a distinct RAG pattern with characteristic
 * challenges. Fixtures are tagged by category for grouped reporting.
 */

export type ScenarioCategory =
  | "factoid"           // Single-fact QA requiring precise retrieval
  | "list-enumeration"  // Structured list completeness (e.g., "20 patterns")
  | "comparison"        // Cross-source synthesis (A vs B)
  | "causality"         // Multi-hop reasoning chains
  | "temporal"          // Time/sequence-based queries
  | "ambiguous"         // Query expansion/disambiguation testing
  | "multi-doc"         // Synthesis across several sources
  | "technical"         // Domain-specific (code, math, ML concepts)
  | "summarization"     // Long-form condensation
  | "explanation"       // "How does X work?" deep dives;

export const SCENARIO_CATEGORIES: Record<ScenarioCategory, {
  description: string;
  typicalChallenge: string;
  exampleQuestions: string[];
  preferredMetricType: "deterministic" | "llm-judge" | "hybrid";
}> = {
  "factoid": {
    description: "Single-fact QA requiring precise retrieval",
    typicalChallenge: "Retrieving the exact fact without noise",
    exampleQuestions: [
      "What is the activation function used in transformers?",
      "Who introduced the attention mechanism?",
    ],
    preferredMetricType: "deterministic",
  },
  "list-enumeration": {
    description: "Structured list completeness",
    typicalChallenge: "Ensuring all items are retrieved and enumerated",
    exampleQuestions: [
      "What are the 20 agentic patterns?",
      "List all the layers in a CNN architecture.",
    ],
    preferredMetricType: "deterministic",
  },
  "comparison": {
    description: "Cross-source synthesis (A vs B)",
    typicalChallenge: "Balancing coverage of both entities",
    exampleQuestions: [
      "Compare SGD and Adam optimizers.",
      "What's the difference between RNN and LSTM?",
    ],
    preferredMetricType: "llm-judge",
  },
  "causality": {
    description: "Multi-hop reasoning chains",
    typicalChallenge: "Connecting cause-effect across chunks",
    exampleQuestions: [
      "Why does batch normalization stabilize training?",
      "What causes gradient explosion in RNNs?",
    ],
    preferredMetricType: "llm-judge",
  },
  "temporal": {
    description: "Time/sequence-based queries",
    typicalChallenge: "Preserving chronological ordering",
    exampleQuestions: [
      "What were the major milestones in deep learning from 2012-2020?",
      "In what order were different attention variants introduced?",
    ],
    preferredMetricType: "llm-judge",
  },
  "ambiguous": {
    description: "Query expansion/disambiguation testing",
    typicalChallenge: "Correctly interpreting ambiguous queries",
    exampleQuestions: [
      "What is attention?", // Could be many types
      "How do you train a transformer?", // Pretrain? Fine-tune?
    ],
    preferredMetricType: "llm-judge",
  },
  "multi-doc": {
    description: "Synthesis across several sources",
    typicalChallenge: "Integrating information from diverse documents",
    exampleQuestions: [
      "Summarize the different perspectives on X from these papers.",
      "What do all sources agree on regarding Y?",
    ],
    preferredMetricType: "llm-judge",
  },
  "technical": {
    description: "Domain-specific (code, math, ML concepts)",
    typicalChallenge: "Precise terminology and notation",
    exampleQuestions: [
      "Derive the backpropagation equations for a ReLU layer.",
      "Implement self-attention in pseudocode.",
    ],
    preferredMetricType: "hybrid",
  },
  "summarization": {
    description: "Long-form condensation",
    typicalChallenge: "Balancing completeness with conciseness",
    exampleQuestions: [
      "Summarize the key ideas from this transcript.",
      "What are the main takeaways from this paper?",
    ],
    preferredMetricType: "llm-judge",
  },
  "explanation": {
    description: "'How does X work?' deep dives",
    typicalChallenge: "Complete, accurate explanation flow",
    exampleQuestions: [
      "How does the transformer architecture process sequences?",
      "Explain the training process for diffusion models.",
    ],
    preferredMetricType: "llm-judge",
  },
};

/**
 * Get the default category for a fixture based on its tags and question.
 */
export function inferCategory(fixture: {
  question: string;
  tags: string[];
}): ScenarioCategory {
  const q = fixture.question.toLowerCase();

  // Check explicit category tag
  for (const [cat] of Object.entries(SCENARIO_CATEGORIES)) {
    if (fixture.tags.includes(cat)) {
      return cat as ScenarioCategory;
    }
  }

  // Infer from question patterns
  if (/what are the \d+|list all|enumerate/i.test(q)) {
    return "list-enumeration";
  }
  if (/compare|difference|versus|vs\.|contrast/i.test(q)) {
    return "comparison";
  }
  if (/why|cause|because|leads to|result in/i.test(q)) {
    return "causality";
  }
  if (/when|timeline|chronological|order|first|introduced/i.test(q)) {
    return "temporal";
  }
  if (/summarize|main points|key takeaways|overview/i.test(q)) {
    return "summarization";
  }
  if (/how does .* work|explain|describe in detail/i.test(q)) {
    return "explanation";
  }

  // Default to factoid for simple "what is" questions
  return "factoid";
}
