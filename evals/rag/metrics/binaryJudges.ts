/**
 * Binary pass/fail LLM judges per failure mode.
 * Default model: deepseek-ai/DeepSeek-V4.1-Flash via Together JSON mode.
 */
import type { EvalBaseline, EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import type { LlmJudgeOptions } from "./llmJudge";
import { createTogetherJudgeInvoker, DEFAULT_JUDGE_MODEL } from "./togetherLlmJudge";

interface BinaryJudgeResult {
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

/**
 * Caps output shown to a judge. A cut excerpt says so; otherwise judges fail long outputs for
 * "ending mid-sentence" at the cut.
 */
function excerptForJudge(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[… output cut off here for judging; the full output is ${text.length} characters and continues. Do not treat this cut as the output ending early.]`;
}

/** Fits every chunk of a typical chat answer (~30 chunks, under 20K characters). */
export const CHUNK_CONTEXT_LIMIT = 48_000;
const CHUNK_SEPARATOR = "\n\n---\n\n";

/**
 * Whole chunks, in order, while they fit in `limit` characters; a chunk that does not fit is
 * skipped and later ones that do are kept. The ids of skipped chunks are listed. A first chunk
 * longer than the limit on its own is cut and marked. Chat answers cite chunks by id ([7]), so
 * each chunk carries its id.
 */
export function formatChunks(
  chunks: EvalRunArtifact["selectedChunks"],
  limit = CHUNK_CONTEXT_LIMIT
): { text: string; truncated: boolean } {
  const parts: string[] = [];
  const skipped: string[] = [];
  let used = 0;
  let cut = false;
  for (const c of chunks) {
    const part = `[${c.id}]${c.sourceTitle ? ` ${c.sourceTitle}` : ""}\n${c.content}`;
    const cost = (parts.length > 0 ? CHUNK_SEPARATOR.length : 0) + part.length;
    if (parts.length === 0 && part.length > limit) {
      cut = true;
      parts.push(`${part.slice(0, limit)}\n[… passage cut off here]`);
      used = limit;
    } else if (used + cost > limit) {
      skipped.push(c.id);
    } else {
      parts.push(part);
      used += cost;
    }
  }
  if (skipped.length > 0) {
    parts.push(`[… ${skipped.length} passages not shown: ${skipped.join(", ")}]`);
  }
  return { text: parts.join(CHUNK_SEPARATOR), truncated: cut || skipped.length > 0 };
}

/** Chunk context for grounding judges, with a note when passages were cut for judging. */
function combineChunkContents(chunks: EvalRunArtifact["selectedChunks"]): string {
  const { text, truncated } = formatChunks(chunks);
  if (!truncated) return text;
  return (
    "Some retrieved passages were cut off for judging; do not fail a claim only because its " +
    `support would be in a passage that is not shown.\n\n${text}`
  );
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
${context}

Answer:
${excerptForJudge(artifact.answer, 8000)}

Pass only if substantive claims are supported by the chunks (minor phrasing ok).
Respond JSON only: {"pass": boolean, "reason": string}`;
}

function chatCitationPrompt(fixture: EvalFixture, artifact: EvalRunArtifact): string {
  const chunkIds = artifact.selectedChunks.map((c) => c.id).join(", ");
  const chunkTitles = [
    ...new Set(artifact.selectedChunks.map((c) => c.sourceTitle).filter(Boolean)),
  ];
  return `You are a citation auditor. Pass if citations in the answer refer to real retrieved sources.
Citation markers such as [7] refer to the retrieved chunk with that id.

Citations in answer: ${artifact.citations.join(", ") || "(none)"}
Retrieved chunk ids: ${chunkIds || "(none)"}
Retrieved source titles: ${chunkTitles.join(", ") || "(none recorded)"}

Answer excerpt:
${excerptForJudge(artifact.answer, 4000)}

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
${excerptForJudge(artifact.answer, 8000)}

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
${excerptForJudge(artifact.answer, 10000)}

Pass if required structure is present (non-empty items, sections, answer keys as applicable).
Respond JSON only: {"pass": boolean, "reason": string}`;
}

function studioGroundingPrompt(fixture: EvalFixture, artifact: EvalRunArtifact): string {
  const context = combineChunkContents(artifact.selectedChunks);
  if (!context.trim()) {
    return `No chunks available — pass if output is coherent for: ${fixture.question}
Output: ${excerptForJudge(artifact.answer, 4000)}
Respond JSON only: {"pass": boolean, "reason": string}`;
  }
  return `Pass if studio output is grounded in notebook chunks.

Question: ${fixture.question}

Chunks:
${context}

Output:
${excerptForJudge(artifact.answer, 8000)}

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
