"use node";

import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps, SuggestedColumn } from "../types";
import { buildPlanPrompt, PlanOutputSchema } from "../prompts";
import { createLLM } from "../../_shared/llm_factory";
import { trackResearchStep } from "../../research/steps";

/**
 * planReview node: LLM plans search strategy and suggests comparison table columns.
 *
 * Input:  state.query (the research question)
 * Output: state.suggestedColumns, state.papers (search queries for next node)
 */
export async function planReviewNode(
  state: LiteratureReviewStateType,
  deps: LiteratureReviewNodeDeps
): Promise<Partial<LiteratureReviewStateType>> {
  const { query } = state;

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "planning",
      "in_progress",
      "Planning search strategy and suggesting columns"
    );
  }

  const llm = createLLM({
    apiKey: deps.apiKey,
    mapModel: deps.smartModel,
    phase: "smart",
    temperatures: 0.3,
    maxTokens: 2000,
  });

  const structured = llm.withStructuredOutput(PlanOutputSchema);
  const prompt = buildPlanPrompt(query);

  const parsed = await structured.invoke([{ role: "user", content: prompt }]);

  const suggestedColumns: SuggestedColumn[] = parsed.suggestedColumns.map((col) => ({
    id: col.id,
    name: col.name,
    instructions: col.instructions,
  }));

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "planning",
      "completed",
      `Suggested ${suggestedColumns.length} columns and ${parsed.searchQueries.length} search queries`
    );
  }

  return {
    suggestedColumns,
    searchQueries: parsed.searchQueries,
    progress: {
      phase: "awaiting_columns",
      percentage: 10,
      message: `Suggested ${suggestedColumns.length} columns. Awaiting user confirmation.`,
    },
  };
}
