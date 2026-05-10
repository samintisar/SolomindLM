"use node";

import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps, ScreenedPaper } from "../types";
import { buildScreeningPrompt, ScreeningOutputSchema } from "../prompts";
import { createLLM } from "../../_shared/llm_factory";
import { trackResearchStep } from "../../research/steps";

const BATCH_SIZE = 5;

/**
 * screenPapers node: PRISMA-style eligibility screening.
 *
 * Batch 5 papers per LLM call for efficiency.
 * Screen top 30 ranked papers.
 *
 * Input:  state.rankedPapers, state.query
 * Output: state.screenedPapers
 */
export async function screenPapersNode(
  state: LiteratureReviewStateType,
  deps: LiteratureReviewNodeDeps
): Promise<Partial<LiteratureReviewStateType>> {
  const { rankedPapers, query } = state;

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "screening",
      "in_progress",
      `Screening ${rankedPapers.length} papers for eligibility...`
    );
  }

  const llm = createLLM({
    apiKey: deps.apiKey,
    mapModel: deps.smartModel,
    phase: "smart",
    temperatures: 0.2,
    maxTokens: 2000,
  });

  const structured = llm.withStructuredOutput(ScreeningOutputSchema);
  const screenedPapers: ScreenedPaper[] = [];

  // Process in batches of 5
  for (let i = 0; i < rankedPapers.length; i += BATCH_SIZE) {
    const batch = rankedPapers.slice(i, i + BATCH_SIZE);
    const batchPapers = batch.map((p) => ({
      paperId: p.doi || p.title,
      title: p.title,
      abstract: p.abstract || "",
    }));

    const prompt = buildScreeningPrompt(query, batchPapers);

    try {
      const parsed = await structured.invoke([{ role: "user", content: prompt }]);

      for (const paper of batch) {
        const decision = parsed.decisions.find(
          (d) => d.paperId === (paper.doi || paper.title)
        );

        screenedPapers.push({
          ...paper,
          isIncluded: decision?.isIncluded ?? true,
          includeReason: decision?.reason,
        });
      }
    } catch (err) {
      // On failure, include all papers in batch (fail-open)
      for (const paper of batch) {
        screenedPapers.push({
          ...paper,
          isIncluded: true,
          includeReason: "Screening failed — included by default",
        });
      }
    }
  }

  const includedCount = screenedPapers.filter((p) => p.isIncluded).length;
  const excludedCount = screenedPapers.length - includedCount;

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "screening",
      "completed",
      `Screened ${screenedPapers.length} papers: ${includedCount} included, ${excludedCount} excluded`,
      { paperCount: screenedPapers.length, includedCount, excludedCount }
    );
  }

  return {
    screenedPapers,
    progress: {
      phase: "screening",
      percentage: 55,
      message: `Screened ${screenedPapers.length} papers: ${includedCount} included, ${excludedCount} excluded.`,
    },
  };
}
