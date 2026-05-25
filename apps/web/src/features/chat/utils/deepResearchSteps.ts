import {
  extractSearchQueriesFromDetails,
  parseResearchStepMetadata,
  type ResearchStep,
} from "../components/researchStepTypes";

/** Steps shown in the deep research chat timeline. */
export const VISIBLE_DEEP_RESEARCH_STEP_TYPES = new Set(["searching", "generating_report"]);

export const deepResearchStepConfig: Record<string, { title: string; description: string }> = {
  searching: {
    title: "Gathering sources",
    description:
      "Searching your notebook, the web, and academic indexes for evidence across each sub-question.",
  },
  generating_report: {
    title: "Synthesizing answer",
    description: "Writing a cited research answer from the sources gathered for each sub-question.",
  },
};

export interface SubQuestionForSteps {
  searchQueries: string[];
}

export function mapDeepResearchSteps(
  stepsData: Array<{
    stepType: string;
    status: string;
    details?: string;
    metadata?: unknown;
  }>,
  subQuestions: SubQuestionForSteps[],
): ResearchStep[] {
  const planningQueries = subQuestions.flatMap((sq) =>
    sq.searchQueries.filter((q) => q.trim().length > 0)
  );

  return stepsData
    .filter((step) => VISIBLE_DEEP_RESEARCH_STEP_TYPES.has(step.stepType))
    .map((step) => {
      const { searchQueries, papersFound } = parseResearchStepMetadata(step.metadata);
      const detailsQueries = step.details
        ? extractSearchQueriesFromDetails(step.details)
        : undefined;
      const resolvedQueries =
        step.stepType === "searching" && planningQueries.length > 0
          ? planningQueries
          : (searchQueries ?? detailsQueries);

      return {
        type: step.stepType,
        status: step.status as ResearchStep["status"],
        title: deepResearchStepConfig[step.stepType]?.title ?? step.stepType,
        description: deepResearchStepConfig[step.stepType]?.description ?? "",
        details:
          step.details?.trim() === "Report generation complete" ? undefined : step.details,
        searchQueries: resolvedQueries,
        papersFound,
      };
    });
}
