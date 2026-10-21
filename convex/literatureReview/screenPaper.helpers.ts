/**
 * Title-and-abstract screening of one paper with the fast model. Shared by the literature review
 * (eligibility screening, off-topic check on notebook papers) and deep research (off-topic check on
 * academic search results, #558).
 *
 * The file name has two dots on purpose: Convex does not treat it as a function module.
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../_agents/_shared/llm_factory.js";
import { invokeWithHttpRetry } from "../_agents/_shared/retry.js";
import { invokeWithTimeout } from "../_agents/_shared/timeout.js";
import {
  SCREEN_PAPERS_SYSTEM_PROMPT,
  SCREEN_SINGLE_PAPER_PROMPT,
  ScreenSinglePaperOutputSchema,
} from "../_agents/literature_review/prompts.js";
import { env } from "../_lib/env.js";
import { bulkLlmModel, truncateForLiteratureLlm } from "./llmTuning.js";
import {
  DEFAULT_SCREENING_CRITERIA,
  decideScreening,
  formatCriteriaForPrompt,
  type ScreeningCriterion,
  type ScreeningDecision,
} from "./screeningCriteria.js";

const SCREEN_SINGLE_PAPER_TIMEOUT_MS = 45_000;

/** The off-topic check: the topic criterion alone. */
const TOPIC_CRITERIA: ScreeningCriterion[] = [DEFAULT_SCREENING_CRITERIA[0]];

/** Screens one paper against the eligibility criteria; throws when the model call fails. */
export async function screenOnePaperWithLlm(
  paper: { title: string; abstract: string },
  query: string,
  criteria: ScreeningCriterion[],
  timeoutMs: number = SCREEN_SINGLE_PAPER_TIMEOUT_MS
): Promise<ScreeningDecision> {
  const llm = createLLM({
    apiKey: env.TOGETHER_AI_API_KEY,
    mapModel: bulkLlmModel(),
    temperatures: 0.2,
    // Room for one short check per criterion plus the reason (the old 256 fit a verdict only).
    maxTokens: 1_200,
    phase: "fast",
  });

  const structuredLlm = llm.withStructuredOutput(ScreenSinglePaperOutputSchema, {
    name: "screen_single_paper",
  });

  const prompt = SCREEN_SINGLE_PAPER_PROMPT.replace(/{query}/g, query)
    .replace(/{criteria}/g, () => formatCriteriaForPrompt(criteria))
    .replace(/{title}/g, paper.title)
    .replace(/{abstract}/g, () => truncateForLiteratureLlm(paper.abstract));

  const response = await invokeWithHttpRetry(
    () =>
      invokeWithTimeout(
        () =>
          structuredLlm.invoke([
            new SystemMessage(SCREEN_PAPERS_SYSTEM_PROMPT),
            new HumanMessage(prompt),
          ]),
        timeoutMs,
        "screenPapers"
      ),
    "screenPapers"
  );

  return decideScreening(response, criteria);
}

/**
 * Whether a paper is clearly off the question's topic. Only a clear "not met" counts: an unclear
 * abstract or a missing kind of evidence is not "off topic". Throws when the model call fails.
 */
export async function checkPaperOffTopic(
  paper: { title: string; abstract: string },
  query: string,
  timeoutMs?: number
): Promise<{ offTopic: boolean; reason: string }> {
  const verdict = await screenOnePaperWithLlm(paper, query, TOPIC_CRITERIA, timeoutMs);
  const offTopic = verdict.criteria
    ? verdict.criteria.some((c) => c.status === "not_met")
    : !verdict.isIncluded;
  return { offTopic, reason: verdict.reason };
}
