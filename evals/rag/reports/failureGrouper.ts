import type { MetricResult, FailureGroup, FailureCategory } from "../types";

/**
 * Map metric names and breakdown categories to failure categories.
 */
function classifyFailure(metric: MetricResult): FailureCategory {
  // abstention_correctness already has a category in its breakdown
  if (metric.metric === "abstention_correctness") {
    const category = (metric.breakdown?.category as string) ?? "prompt_answering";
    if (category === "retrieval_coverage") return "retrieval";
    if (category === "context_selection") return "context_selection";
    return "prompt_answering";
  }

  // retrieval_item_recall_* metrics
  if (metric.metric.startsWith("retrieval_item_recall_")) {
    return "retrieval";
  }

  // precision and ndcg are about ranking/selection quality
  if (metric.metric === "retrieval_precision_at_k" || metric.metric === "retrieval_ndcg_at_k") {
    return "context_selection";
  }

  if (metric.metric === "citation_validity") return "citation";
  if (metric.metric === "latency_cost_budget") return "latency_cost";
  if (metric.metric === "expected_item_recall") return "prompt_answering";

  return "prompt_answering"; // default
}

/**
 * Suggested fix scope per failure category.
 */
const FIX_SUGGESTIONS: Record<FailureCategory, { scope: string; files: string[] }> = {
  retrieval: {
    scope: "Improve vector/keyword search query generation or hybrid search configuration to surface more relevant chunks",
    files: [
      "convex/_agents/chat/llm_wrapper.ts",
      "convex/_agents/chat/hybrid_search.ts",
      "convex/_agents/chat/vector_search.ts",
    ],
  },
  context_selection: {
    scope: "Adjust context selection thresholds, token budget, or reranking to retain relevant chunks",
    files: [
      "convex/_agents/chat/chunkContext.ts",
      "convex/_agents/chat/chatConfig.ts",
      "convex/_agents/chat/hybrid_search.ts",
    ],
  },
  prompt_answering: {
    scope: "Improve answer generation prompts to enumerate all available items instead of abstaining",
    files: [
      "convex/_agents/chat/llm_wrapper.ts",
      "convex/_agents/chat/chat_llm_prompts.ts",
      "convex/_agents/chat/ChatAgent.ts",
    ],
  },
  citation: {
    scope: "Fix citation extraction or grounding validation to produce accurate references",
    files: [
      "convex/_agents/chat/grounding_validator.ts",
      "convex/_agents/chat/llm_wrapper.ts",
    ],
  },
  research_planning: {
    scope: "Improve research plan decomposition or evidence gathering for complex queries",
    files: [
      "convex/_agents/research/graph.ts",
      "convex/_agents/research/nodes.ts",
      "convex/_agents/research/prompts.ts",
    ],
  },
  latency_cost: {
    scope: "Reduce latency or token usage — check for redundant LLM calls, oversized contexts, or missing caches",
    files: [
      "convex/_agents/chat/chatConfig.ts",
      "convex/_agents/chat/ChatAgent.ts",
    ],
  },
};

export interface GroupFailuresOptions {
  /** Include metrics with "warn" status in failure groups (default: true) */
  includeWarnings?: boolean;
}

/**
 * Group failed metric results into FailureGroups for coding agent consumption.
 * Each group targets a single failure category with suggested fixes and target files.
 */
export function groupFailures(
  metrics: MetricResult[],
  options?: GroupFailuresOptions
): FailureGroup[] {
  const includeWarnings = options?.includeWarnings ?? true;

  // Filter to failures (and optionally warnings)
  const failures = metrics.filter(
    (m) => m.status === "fail" || (includeWarnings && m.status === "warn")
  );

  if (failures.length === 0) return [];

  // Group by (category, runner)
  const groups = new Map<
    string,
    {
      category: FailureCategory;
      cases: Map<
        string,
        { caseId: string; runner: string; failures: MetricResult[] }
      >;
    }
  >();

  for (const metric of failures) {
    const category = classifyFailure(metric);
    const key = `${category}::${metric.runner}`;

    if (!groups.has(key)) {
      groups.set(key, { category, cases: new Map() });
    }
    const group = groups.get(key)!;

    const caseKey = `${metric.caseId}::${metric.runner}`;
    if (!group.cases.has(caseKey)) {
      group.cases.set(caseKey, {
        caseId: metric.caseId,
        runner: metric.runner,
        failures: [],
      });
    }
    group.cases.get(caseKey)!.failures.push(metric);
  }

  // Build FailureGroup array
  return Array.from(groups.values()).map(({ category, cases }) => {
    const fix = FIX_SUGGESTIONS[category];
    return {
      category,
      cases: Array.from(cases.values()).map((c) => ({
        caseId: c.caseId,
        runner: c.runner as "chat" | "research",
        failures: c.failures,
        traceHints: c.failures.map((f) => `${f.metric}: ${f.detail}`),
      })),
      suggestedFix: fix.scope,
      targetFiles: fix.files,
    };
  });
}
