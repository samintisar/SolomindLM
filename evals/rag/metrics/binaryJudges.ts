/**
 * Binary pass/fail LLM judges per failure mode.
 * Default model: deepseek-ai/DeepSeek-V4-Flash-0731 via Together JSON mode.
 */
import type { EvalBaseline, EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import type { LlmJudgeOptions } from "./llmJudge";
import { createTogetherJudgeInvoker, DEFAULT_JUDGE_MODEL } from "./togetherLlmJudge";

export interface BinaryJudgeResult {
  pass: boolean;
  reason: string;
}

export interface BinaryJudgeOptions extends LlmJudgeOptions {
  /** When false, skip network judges (unit tests). */
  enabled?: boolean;
}

function baseMetric(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  pass: boolean,
  reason: string,
  breakdown?: Record<string, unknown>
): MetricResult {
  return {
    metric,
    caseId: fixture.id,
    runner: artifact.runner,
    configHash: artifact.configHash,
    status: pass ? "pass" : "fail",
    score: pass ? 1 : 0,
    detail: reason,
    breakdown,
  };
}

function combineChunkContents(chunks: EvalRunArtifact["selectedChunks"]): string {
  return chunks.map((c) => `[${c.sourceTitle}]\n${c.content}`).join("\n\n---\n\n");
}

function parseBinaryResponse(raw: string): BinaryJudgeResult {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const payload = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(payload) as { pass?: boolean; reason?: string };
  if (typeof parsed.pass !== "boolean") {
    throw new Error("Judge response missing boolean 'pass'");
  }
  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : "No reason provided";
  return { pass: parsed.pass, reason };
}

async function runBinaryJudge(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  prompt: string,
  invoke: NonNullable<LlmJudgeOptions["invoke"]>,
  model: string
): Promise<MetricResult> {
  try {
    const raw = await invoke(prompt);
    const { pass, reason } = parseBinaryResponse(raw);
    return baseMetric(metric, fixture, artifact, pass, reason, { model, pass });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return baseMetric(metric, fixture, artifact, false, `Binary judge failed: ${message}`, {
      model,
      error: message,
    });
  }
}

function chatGroundingPrompt(fixture: EvalFixture, artifact: EvalRunArtifact): string {
  const context = combineChunkContents(artifact.selectedChunks);
  return `You are a strict RAG evaluator. Decide if the answer is grounded in the retrieved chunks.

Question: ${fixture.question}

Retrieved chunks:
${context.slice(0, 12000)}

Answer:
${artifact.answer.slice(0, 8000)}

Pass only if substantive claims are supported by the chunks (minor phrasing ok).
Respond JSON only: {"pass": boolean, "reason": string}`;
}

function chatCitationPrompt(fixture: EvalFixture, artifact: EvalRunArtifact): string {
  const chunkTitles = artifact.selectedChunks.map((c) => c.sourceTitle).join(", ");
  return `You are a citation auditor. Pass if citations in the answer refer to real retrieved sources.

Citations in answer: ${artifact.citations.join(", ") || "(none)"}
Available chunk source titles: ${chunkTitles || "(none)"}

Answer excerpt:
${artifact.answer.slice(0, 4000)}

Pass if citations map to listed sources or the answer has no citations when none were required.
Respond JSON only: {"pass": boolean, "reason": string}`;
}

export function formatResearchEvidence(artifact: EvalRunArtifact): string {
  const fromEvidence = (artifact.evidence ?? [])
    .filter((row) => row.content.trim())
    .map((row) => `[${row.sourceTitle}] ${row.content.slice(0, 500)}`);
  if (fromEvidence.length > 0) {
    return fromEvidence.join("\n");
  }
  return artifact.selectedChunks
    .map((chunk) => `[${chunk.sourceTitle}] ${chunk.content.slice(0, 500)}`)
    .join("\n");
}

function researchGroundingPrompt(fixture: EvalFixture, artifact: EvalRunArtifact): string {
  const evidence = formatResearchEvidence(artifact);
  return `You are evaluating a research synthesis. Pass if the answer is grounded in listed evidence.

Question: ${fixture.question}

Evidence:
${evidence.slice(0, 12000) || "(no evidence recorded)"}

Answer:
${artifact.answer.slice(0, 8000)}

Respond JSON only: {"pass": boolean, "reason": string}`;
}

function researchPlanPrompt(fixture: EvalFixture, artifact: EvalRunArtifact): string {
  const subs = artifact.researchPlan?.subQuestions?.map((q) => q.question).join("\n") ?? "";
  return `You are evaluating a research plan. Pass if sub-questions collectively address the user question.

User question: ${fixture.question}

Plan sub-questions:
${subs || "(none)"}

Respond JSON only: {"pass": boolean, "reason": string}`;
}

function studioStructurePrompt(fixture: EvalFixture, artifact: EvalRunArtifact): string {
  const minItems = fixture.expectedStructure?.minItems;
  const sections = fixture.expectedStructure?.requiredSections?.join(", ") ?? "";
  return `You are evaluating studio output structure for runner "${artifact.runner}".

Expected behavior: ${fixture.expectedBehavior}
Min items: ${minItems ?? "n/a"}
Required sections: ${sections || "n/a"}

Output (truncated):
${artifact.answer.slice(0, 10000)}

Pass if required structure is present (non-empty items, sections, answer keys as applicable).
Respond JSON only: {"pass": boolean, "reason": string}`;
}

function studioGroundingPrompt(fixture: EvalFixture, artifact: EvalRunArtifact): string {
  const context = combineChunkContents(artifact.selectedChunks);
  if (!context.trim()) {
    return `No chunks available — pass if output is coherent for: ${fixture.question}
Output: ${artifact.answer.slice(0, 4000)}
Respond JSON only: {"pass": boolean, "reason": string}`;
  }
  return `Pass if studio output is grounded in notebook chunks.

Question: ${fixture.question}

Chunks:
${context.slice(0, 12000)}

Output:
${artifact.answer.slice(0, 8000)}

Respond JSON only: {"pass": boolean, "reason": string}`;
}

/**
 * Run binary judges appropriate for the artifact runner.
 */
export async function scoreBinaryJudgeMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  baseline?: EvalBaseline,
  options: BinaryJudgeOptions = {}
): Promise<MetricResult[]> {
  void baseline;
  if (options.enabled === false) {
    return [];
  }

  const invoke =
    options.invoke ??
    (process.env.TOGETHER_AI_API_KEY?.trim()
      ? createTogetherJudgeInvoker({ model: options.model ?? DEFAULT_JUDGE_MODEL })
      : undefined);

  if (!invoke) {
    return [];
  }

  const model = options.model ?? DEFAULT_JUDGE_MODEL;
  const results: MetricResult[] = [];

  if (artifact.runner === "chat") {
    results.push(
      await runBinaryJudge(
        "binary_judge_chat_grounding",
        fixture,
        artifact,
        chatGroundingPrompt(fixture, artifact),
        invoke,
        model
      )
    );
    if (artifact.citations.length > 0) {
      results.push(
        await runBinaryJudge(
          "binary_judge_citation_valid",
          fixture,
          artifact,
          chatCitationPrompt(fixture, artifact),
          invoke,
          model
        )
      );
    }
  }

  if (artifact.runner === "research") {
    results.push(
      await runBinaryJudge(
        "binary_judge_research_grounding",
        fixture,
        artifact,
        researchGroundingPrompt(fixture, artifact),
        invoke,
        model
      )
    );
    if (artifact.researchPlan?.subQuestions?.length) {
      results.push(
        await runBinaryJudge(
          "binary_judge_research_plan",
          fixture,
          artifact,
          researchPlanPrompt(fixture, artifact),
          invoke,
          model
        )
      );
    }
  }

  if (artifact.runner === "literatureReview") {
    results.push(
      await runBinaryJudge(
        "binary_judge_lr_sections",
        fixture,
        artifact,
        studioStructurePrompt(fixture, artifact),
        invoke,
        model
      )
    );
  }

  const studioRunners = new Set([
    "report",
    "flashcards",
    "quiz",
    "mindmap",
    "infographic",
    "spreadsheet",
    "writtenQuestions",
    "audioScript",
    "audioScriptOnly",
  ]);
  if (studioRunners.has(artifact.runner)) {
    results.push(
      await runBinaryJudge(
        "binary_judge_studio_structure",
        fixture,
        artifact,
        studioStructurePrompt(fixture, artifact),
        invoke,
        model
      )
    );
    results.push(
      await runBinaryJudge(
        "binary_judge_studio_grounding",
        fixture,
        artifact,
        studioGroundingPrompt(fixture, artifact),
        invoke,
        model
      )
    );
  }

  return results;
}

export { parseBinaryResponse };
