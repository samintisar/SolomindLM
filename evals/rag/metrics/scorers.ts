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
import { scoreContextRelevance } from "./contextRelevance";
import {
  abstentionCorrectness,
  citationValidity,
  expectedItemRecall,
  latencyCostBudget,
  retrievalItemRecall,
  retrievalNdcgAtK,
  retrievalNonEmpty,
  retrievalPrecisionAtK,
} from "./index";
import {
  scoreLiteratureReviewLlmJudgeMetrics,
  scoreLiteratureReviewMetrics,
} from "./literatureReview";
import { type LlmJudgeOptions, scoreAllLlmJudgeMetrics } from "./llmJudge";
import {
  passageNdcgSelected,
  passagePrecisionSelected,
  passageRecallByStage,
} from "./retrievalGold";
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
  /** Rubric check ids to judge (`--rubric`); every applicable check when unset. */
  rubricChecks?: string[];
  /** `false` turns judge reasoning off (`--judge-reasoning off`). */
  judgeReasoning?: boolean;
  /** Fraction (0–1) of binary judge calls re-run once to measure self-consistency. */
  judgeConsistencySample?: number;
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
    reasoning: options.judgeReasoning,
  });
}

/**
 * Retrieval-only runs (`--retrieval-only`) generate no answer, so answer metrics and every judge
 * are skipped. What was found, selected and how fast is still scored.
 */
function scoreRetrievalOnlyMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  baseline?: EvalBaseline
): MetricResult[] {
  return [
    expectedItemRecall(fixture, artifact, baseline),
    latencyCostBudget(fixture, artifact, baseline),
    contextTokenBudgetRatio(fixture, artifact, baseline),
    stageTokenShare(fixture, artifact, baseline),
    retrievalNonEmpty(fixture, artifact, baseline),
    ...retrievalItemRecall(fixture, artifact, baseline),
    retrievalPrecisionAtK(fixture, artifact, baseline),
    retrievalNdcgAtK(fixture, artifact, baseline),
    ...passageRecallByStage(fixture, artifact),
    passagePrecisionSelected(fixture, artifact),
    passageNdcgSelected(fixture, artifact),
  ];
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
  if (artifact.retrievalOnly) {
    return scoreRetrievalOnlyMetrics(fixture, artifact, baseline);
  }

  const results: MetricResult[] = [];

  results.push(expectedItemRecall(fixture, artifact, baseline));
  results.push(latencyCostBudget(fixture, artifact, baseline));
  results.push(contextTokenBudgetRatio(fixture, artifact, baseline));
  results.push(stageTokenShare(fixture, artifact, baseline));

  if (isChunkRetrievalRunner(artifact.runner)) {
    results.push(retrievalNonEmpty(fixture, artifact, baseline));
    results.push(retrievalPrecisionAtK(fixture, artifact, baseline));
    results.push(retrievalNdcgAtK(fixture, artifact, baseline));
    results.push(abstentionCorrectness(fixture, artifact, baseline));
    results.push(...retrievalItemRecall(fixture, artifact, baseline));
    results.push(...passageRecallByStage(fixture, artifact));
    results.push(passagePrecisionSelected(fixture, artifact));
    results.push(passageNdcgSelected(fixture, artifact));
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
    sourceTexts: options.packSourceTexts,
    judgeConsistencySample: options.judgeConsistencySample,
  };

  // Judge groups run one after another (each parallelises its own judges), so one case never
  // bursts the shared Together key; rows keep the order binary, rubric, Likert.
  const judgeGroups: Array<() => Promise<MetricResult[]>> = [
    async () => {
      const binary = await scoreBinaryJudgeMetrics(fixture, artifact, baseline, binaryOptions);
      // Reference-free context relevance: after the binary judges, on the same invoker. It skips
      // fixtures with deterministic gold itself.
      const context =
        binaryOptions.enabled && invoke
          ? await scoreContextRelevance(fixture, artifact, { invoke, model: judgeModel })
          : [];
      return [...binary, ...context];
    },
  ];

  const useCase = fixture.useCase;
  if (useCase && binaryOptions.enabled && invoke) {
    judgeGroups.push(() =>
      scoreRubricMetrics(fixture, artifact, getPack(useCase).pack, {
        invoke,
        model: judgeModel,
        sourceTexts: options.packSourceTexts,
        onlyChecks: options.rubricChecks,
      })
    );
  }

  if (options.likertJudges && !options.dryRun && invoke) {
    const likertModel = options.judgeModel ?? "openai/gpt-oss-120b";
    const likertOptions: LlmJudgeOptions = {
      invoke: options.judgeInvoke ?? createTogetherJudgeInvoker({ model: likertModel }),
      model: likertModel,
    };
    judgeGroups.push(() =>
      artifact.runner === "literatureReview"
        ? scoreLiteratureReviewLlmJudgeMetrics(fixture, artifact, likertOptions)
        : scoreAllLlmJudgeMetrics(fixture, artifact, likertOptions)
    );
  }

  for (const runGroup of judgeGroups) {
    results.push(...(await runGroup()));
  }

  return results;
}
