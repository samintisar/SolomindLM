/**
 * Aggregator that runs all deterministic metrics and returns a flat
 * MetricResult[] for a single fixture/artifact pair.
 */
import {
  type EvalBaseline,
  type EvalFixture,
  type EvalRunArtifact,
  isStudioRunner,
  type MetricResult,
} from "../types";
import { getPack } from "../usecases";
import type { SourceText } from "../usecases/types";
import { type BinaryJudgeOptions, scoreBinaryJudgeMetrics } from "./binaryJudges";
import {
  abstentionCorrectness,
  citationValidity,
  expectedItemRecall,
  latencyCostBudget,
  retrievalItemRecall,
  retrievalNdcgAtK,
  retrievalPrecisionAtK,
} from "./index";
import {
  scoreLiteratureReviewLlmJudgeMetrics,
  scoreLiteratureReviewMetrics,
} from "./literatureReview";
import { type LlmJudgeOptions, scoreAllLlmJudgeMetrics } from "./llmJudge";
import { scoreRubricMetrics } from "./rubric";
import {
  externalSourceUtilization,
  researchSourceBreadth,
  sourceDiversityScore,
  sourceRecallByChannel,
} from "./sourceAware";
import { contextTokenBudgetRatio, stageTokenShare } from "./stageBudget";
import { scoreStudioMetrics } from "./studio";
import { createTogetherJudgeInvoker, DEFAULT_JUDGE_MODEL } from "./togetherLlmJudge";

export interface ScoreAllMetricsOptions {
  /** Run legacy Likert 0–1 LLM judges (default false). */
  likertJudges?: boolean;
  /** Skip all LLM judges (dry-run stub artifacts). */
  dryRun?: boolean;
  /** Override judge model for binary + Likert judges. */
  judgeModel?: string;
  /** Custom judge invoker (tests). */
  judgeInvoke?: LlmJudgeOptions["invoke"];
  /** Extracted pack source text for rubric judges (use-case pack fixtures) */
  packSourceTexts?: SourceText[];
}

function isChunkRetrievalRunner(runner: EvalRunArtifact["runner"]): boolean {
  return runner === "chat";
}

function isRagRunner(runner: EvalRunArtifact["runner"]): boolean {
  return runner === "chat" || runner === "research";
}

function judgeInvoker(options: ScoreAllMetricsOptions): LlmJudgeOptions["invoke"] | undefined {
  if (options.judgeInvoke) {
    return options.judgeInvoke;
  }
  if (!process.env.TOGETHER_AI_API_KEY?.trim()) {
    return undefined;
  }
  return createTogetherJudgeInvoker({
    model: options.judgeModel ?? DEFAULT_JUDGE_MODEL,
  });
}

/**
 * Run every metric for a single eval case.
 */
export async function scoreAllMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  baseline?: EvalBaseline,
  options: ScoreAllMetricsOptions = {}
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];

  results.push(expectedItemRecall(fixture, artifact, baseline));
  results.push(latencyCostBudget(fixture, artifact, baseline));
  results.push(contextTokenBudgetRatio(fixture, artifact, baseline));
  results.push(stageTokenShare(fixture, artifact, baseline));

  if (isChunkRetrievalRunner(artifact.runner)) {
    results.push(retrievalPrecisionAtK(fixture, artifact, baseline));
    results.push(retrievalNdcgAtK(fixture, artifact, baseline));
    results.push(abstentionCorrectness(fixture, artifact, baseline));
    results.push(...retrievalItemRecall(fixture, artifact, baseline));
  }

  if (isRagRunner(artifact.runner)) {
    results.push(citationValidity(fixture, artifact, baseline));

    if (artifact.sourcePolicy) {
      results.push(sourceDiversityScore(fixture, artifact, baseline));
      results.push(...sourceRecallByChannel(fixture, artifact, baseline));
      results.push(externalSourceUtilization(fixture, artifact, baseline));
      if (artifact.runner === "research") {
        results.push(researchSourceBreadth(fixture, artifact, baseline));
      }
    }
  } else if (artifact.runner === "literatureReview") {
    results.push(...scoreLiteratureReviewMetrics(fixture, artifact, baseline));
  } else if (isStudioRunner(artifact.runner)) {
    const studioResults = await scoreStudioMetrics(fixture, artifact, baseline);
    results.push(...studioResults);
  }

  const invoke = options.dryRun ? undefined : judgeInvoker(options);
  const judgeModel = options.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const binaryOptions: BinaryJudgeOptions = {
    invoke,
    model: judgeModel,
    enabled: !options.dryRun && invoke !== undefined,
  };

  // Judge groups of one artifact run concurrently; rows keep the order binary, rubric, Likert.
  const judgeGroups: Array<Promise<MetricResult[]>> = [
    scoreBinaryJudgeMetrics(fixture, artifact, baseline, binaryOptions),
  ];

  if (fixture.useCase && binaryOptions.enabled && invoke) {
    judgeGroups.push(
      scoreRubricMetrics(fixture, artifact, getPack(fixture.useCase).pack, {
        invoke,
        model: judgeModel,
        sourceTexts: options.packSourceTexts,
      })
    );
  }

  if (options.likertJudges && !options.dryRun && invoke) {
    const likertModel = options.judgeModel ?? "openai/gpt-oss-120b";
    const likertOptions: LlmJudgeOptions = {
      invoke: options.judgeInvoke ?? createTogetherJudgeInvoker({ model: likertModel }),
      model: likertModel,
    };
    judgeGroups.push(
      artifact.runner === "literatureReview"
        ? scoreLiteratureReviewLlmJudgeMetrics(fixture, artifact, likertOptions)
        : scoreAllLlmJudgeMetrics(fixture, artifact, likertOptions)
    );
  }

  for (const group of await Promise.all(judgeGroups)) {
    results.push(...group);
  }

  return results;
}
