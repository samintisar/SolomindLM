/**
 * Binary pass/fail LLM judges per failure mode.
 * Default model: deepseek-ai/DeepSeek-V4.1-Flash via Together JSON mode.
 */

import { createHash } from "crypto";
import {
  type EvalBaseline,
  type EvalFixture,
  type EvalRunArtifact,
  isStudioRunner,
  type MetricResult,
  type StudioRunnerKind,
} from "../types";
import type { SourceText } from "../usecases/types";
import { CUT_NOTE, formatSourceTexts, SOURCE_TEXTS_LIMIT } from "./evidence";
import type { LlmJudgeOptions } from "./llmJudge";
import { metricResult } from "./metricResult";
import { createTogetherJudgeInvoker, DEFAULT_JUDGE_MODEL } from "./togetherLlmJudge";

interface BinaryJudgeResult {
  pass: boolean;
  reason: string;
}

export interface BinaryJudgeOptions extends LlmJudgeOptions {
  /** When false, skip network judges (unit tests). */
  enabled?: boolean;
  /** Pack source text, the grounding evidence for studio artifacts that have no chunks */
  sourceTexts?: SourceText[];
  /** Fraction (0–1) of judge calls to run a second time for self-consistency */
  judgeConsistencySample?: number;
}

const consistencyTotals = { sampled: 0, agreed: 0 };

/** Self-consistency since the last reset: repeated judge calls, and how many repeated the verdict. */
export function judgeConsistencyTally(): { sampled: number; agreed: number } {
  return { ...consistencyTotals };
}

export function resetJudgeConsistencyTally(): void {
  consistencyTotals.sampled = 0;
  consistencyTotals.agreed = 0;
}

/**
 * Whether this case and metric are in the self-consistency sample. Deterministic (a hash of
 * `caseId|metric`), so the same judge calls are re-run on every run and their results compare.
 */
export function isConsistencySampled(
  caseId: string,
  runner: string,
  metric: string,
  sample: number
): boolean {
  if (sample <= 0) return false;
  if (sample >= 1) return true;
  const key = `${caseId}|${runner}|${metric}`;
  const bucket = createHash("sha1").update(key).digest().readUInt32BE(0) % 100;
  return bucket < sample * 100;
}

/**
 * Caps output shown to a judge. A cut excerpt says so; otherwise judges fail long outputs for
 * "ending mid-sentence" at the cut.
 */
function excerptForJudge(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[… output cut off here for judging; the full output is ${text.length} characters and continues. Do not treat this cut as the output ending early.]`;
}

/**
 * Passage budget for judge prompts. List questions can hand chat one whole-document passage
 * (87K characters for the agentic-patterns transcript); a judge that sees only the first half
 * fails claims from the second half. Same budget as whole-pack source text. It is a size guide,
 * not a model limit: the cut and skipped-passage notes and the grounding warning are added on top.
 */
export const CHUNK_CONTEXT_LIMIT = SOURCE_TEXTS_LIMIT;
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
    const part = `[${c.id}]${c.sourceTitle ? ` ${c.sourceTitle}` : ""}\n${c.contextText ?? c.content}`;
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
function combineChunkContents(
  chunks: EvalRunArtifact["selectedChunks"],
  limit = CHUNK_CONTEXT_LIMIT
): string {
  const { text, truncated } = formatChunks(chunks, limit);
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

/** Verdict from a repeat call, or null when the repeat fails (it is then not counted). */
async function repeatVerdict(
  prompt: string,
  invoke: NonNullable<LlmJudgeOptions["invoke"]>
): Promise<boolean | null> {
  try {
    return parseBinaryResponse(await invoke(prompt)).pass;
  } catch {
    return null;
  }
}

async function runBinaryJudge(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  prompt: string,
  invoke: NonNullable<LlmJudgeOptions["invoke"]>,
  model: string,
  consistencySample = 0
): Promise<MetricResult> {
  try {
    const raw = await invoke(prompt);
    const { pass, reason } = parseBinaryResponse(raw);
    const breakdown: Record<string, unknown> = { model, pass };
    if (isConsistencySampled(artifact.caseId, artifact.runner, metric, consistencySample)) {
      const second = await repeatVerdict(prompt, invoke);
      if (second !== null) {
        consistencyTotals.sampled++;
        if (second === pass) {
          consistencyTotals.agreed++;
        } else {
          // The first verdict stands; the flip is visible in the row.
          breakdown.judgeUnstable = true;
          breakdown.secondVerdict = second ? "pass" : "fail";
        }
      }
    }
    return metricResult(
      metric,
      fixture,
      artifact,
      pass ? "pass" : "fail",
      pass ? 1 : 0,
      reason,
      breakdown
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return metricResult(metric, fixture, artifact, "fail", 0, `Binary judge failed: ${message}`, {
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

/**
 * Mirrors the research writer's evidence packing (`synthesize` in convex/_agents/research/nodes.ts):
 * per sub-question, the 8 most relevant entries at up to 2,000 characters each; over 120,000 in
 * all, every entry shrinks (not below 500) so each sub-question keeps its share. The judge then
 * sees what the writer saw. A smaller cut fails claims drawn from evidence the judge never got.
 */
const RESEARCH_EVIDENCE_PER_SUBQUESTION = 8;
const RESEARCH_ENTRY_CHARS = 2_000;
const RESEARCH_MIN_ENTRY_CHARS = 500;
export const RESEARCH_EVIDENCE_LIMIT = 120_000;

function packResearchEvidence(rows: NonNullable<EvalRunArtifact["evidence"]>): string {
  const bySubQuestion = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = bySubQuestion.get(row.subQuestionId) ?? [];
    group.push(row);
    bySubQuestion.set(row.subQuestionId, group);
  }
  const kept = [...bySubQuestion.values()].flatMap((group) =>
    [...group]
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
      .slice(0, RESEARCH_EVIDENCE_PER_SUBQUESTION)
  );
  const format = (entryChars: number) =>
    kept.map((row) => `[${row.sourceTitle}] ${row.content.slice(0, entryChars)}`).join("\n");
  const full = format(RESEARCH_ENTRY_CHARS);
  if (full.length <= RESEARCH_EVIDENCE_LIMIT) return full;
  // As the writer does, the shrunk budget is split over all evidence rows, not just the kept ones.
  return format(
    Math.max(RESEARCH_MIN_ENTRY_CHARS, Math.floor((RESEARCH_EVIDENCE_LIMIT - 5_000) / rows.length))
  );
}

export function formatResearchEvidence(artifact: EvalRunArtifact): string {
  const rows = (artifact.evidence ?? []).filter((row) => row.content.trim());
  if (rows.length > 0) {
    return packResearchEvidence(rows);
  }
  return artifact.selectedChunks
    .map((chunk) => `[${chunk.sourceTitle}] ${chunk.content.slice(0, RESEARCH_ENTRY_CHARS)}`)
    .join("\n");
}

/** Research evidence for the judge, marked when the total budget cut it. */
export function researchEvidenceForJudge(artifact: EvalRunArtifact): string {
  const evidence = formatResearchEvidence(artifact);
  if (!evidence) return "(no evidence recorded)";
  if (evidence.length <= RESEARCH_EVIDENCE_LIMIT) return evidence;
  return (
    `${evidence.slice(0, RESEARCH_EVIDENCE_LIMIT)}\n[… evidence cut off here for judging]\n` +
    "Do not fail a claim only because its support would be in evidence past the cut."
  );
}

function researchGroundingPrompt(fixture: EvalFixture, artifact: EvalRunArtifact): string {
  return `You are evaluating a research synthesis. Pass if the answer is grounded in listed evidence.

Question: ${fixture.question}

Evidence:
${researchEvidenceForJudge(artifact)}

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

const GENERIC_STRUCTURE_CRITERION =
  "Pass only if the required structure is present: non-empty items, the required sections, and answer keys as applicable.";
const GENERIC_GROUNDING_CRITERION =
  "Pass only if substantive claims are supported by the evidence (minor phrasing ok).";

/**
 * Per-kind structure criteria. Infographics are not listed: the vision judge covers them, so they
 * keep the generic line, as do literature reviews (not a studio kind).
 */
const STUDIO_STRUCTURE_CRITERIA: Partial<Record<StudioRunnerKind, string>> = {
  flashcards:
    "Pass only if the output is a non-empty list of cards, and every card has a non-empty front and a non-empty back.",
  quiz: "Pass only if the output is a non-empty list of questions, and each question has a stem, at least two options and exactly one answer key. Explanations, when present, are non-empty and consistent with the key.",
  report:
    "Pass only if the output is a markdown report with a non-empty body under every required section heading.",
  audioScript:
    "Pass only if the output is a non-empty script of turns, and every turn has a speaker and non-empty text.",
  audioScriptOnly:
    "Pass only if the output is a non-empty script of turns, and every turn has a speaker and non-empty text.",
  mindmap:
    "Pass only if the output is a tree with a root node and child nodes, and every node has a non-empty label.",
  spreadsheet:
    "Pass only if the output has a header row and data rows, every row has a value for each header column, and the category columns are filled.",
  writtenQuestions:
    "Pass only if the output is a non-empty list of questions, and every question has a model answer.",
};

/**
 * Per-kind grounding criteria. Infographics keep the generic line (the vision judge handles them).
 */
const STUDIO_GROUNDING_CRITERIA: Partial<Record<StudioRunnerKind, string>> = {
  flashcards:
    "Pass only if every card's front and back are supported by the sources, and no card contradicts them.",
  quiz: "Pass only if each correct option is supported by the sources, no distractor is also correct according to the sources, and any explanations given do not invent facts.",
  report:
    "Pass only if substantive claims and figures are supported by the sources (minor phrasing ok).",
  audioScript:
    "Pass only if substantive claims and figures are supported by the sources (minor phrasing ok).",
  audioScriptOnly:
    "Pass only if substantive claims and figures are supported by the sources (minor phrasing ok).",
  mindmap: "Pass only if the node labels name concepts that are present in the sources.",
  spreadsheet: "Pass only if cell values and categories are traceable to the sources.",
  writtenQuestions: "Pass only if the questions and model answers are supported by the sources.",
};

function criterionFor(
  table: Partial<Record<StudioRunnerKind, string>>,
  runner: string,
  generic: string
): string {
  return isStudioRunner(runner) ? (table[runner] ?? generic) : generic;
}

function studioStructurePrompt(fixture: EvalFixture, artifact: EvalRunArtifact): string {
  const minItems = fixture.expectedStructure?.minItems;
  const sections = fixture.expectedStructure?.requiredSections?.join(", ") ?? "";
  const criterion = criterionFor(
    STUDIO_STRUCTURE_CRITERIA,
    artifact.runner,
    GENERIC_STRUCTURE_CRITERION
  );
  return `You are a strict reviewer checking the structure of a studio ${artifact.runner} output. Check structure only; whether the content is true is judged separately.

Question: ${fixture.question}
Expected behavior: ${fixture.expectedBehavior}
Min items: ${minItems ?? "n/a"}
Required sections: ${sections || "n/a"}

Pass criteria for ${artifact.runner}:
${criterion}

Output (truncated):
${excerptForJudge(artifact.answer, 10000)}

Respond JSON only: {"pass": boolean, "reason": string}`;
}

/** Null when the artifact has neither retrieved chunks nor pack source text to judge against. */
function studioGroundingPrompt(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  sourceTexts: SourceText[] = []
): string | null {
  const criterion = criterionFor(
    STUDIO_GROUNDING_CRITERIA,
    artifact.runner,
    GENERIC_GROUNDING_CRITERION
  );
  const pass = `Pass criteria for ${artifact.runner}:\n${criterion}`;
  const context = combineChunkContents(artifact.selectedChunks);
  if (context.trim()) {
    return `You are a strict evaluator checking a studio ${artifact.runner} output against the notebook passages it was built from.

Question: ${fixture.question}

Retrieved chunks:
${context}

Output:
${excerptForJudge(artifact.answer, 8000)}

${pass}
Respond JSON only: {"pass": boolean, "reason": string}`;
  }
  if (sourceTexts.length === 0) return null;
  const formatted = formatSourceTexts(sourceTexts, SOURCE_TEXTS_LIMIT);
  const header = formatted.truncated
    ? "Source text (some documents cut off):"
    : "Source text (complete):";
  return `You are a strict evaluator checking a studio ${artifact.runner} output against the source text it was made from.

Question: ${fixture.question}

${header}
${formatted.truncated ? `${CUT_NOTE}\n` : ""}${formatted.text}

Output:
${excerptForJudge(artifact.answer, 8000)}

${pass}
Respond JSON only: {"pass": boolean, "reason": string}`;
}

/** Warn, not fail or pass: a silent pass hid the missing evidence, and a fail would be a guess. */
function noGroundingEvidence(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  model: string
): MetricResult {
  return metricResult(
    "binary_judge_studio_grounding",
    fixture,
    artifact,
    "warn",
    0,
    "No grounding evidence: studio artifact has no retrieved chunks and no source text (fixture sourceFiles or pack).",
    { noEvidence: true, model }
  );
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
  // A null prompt means the judge has no evidence to read; it is reported without a call.
  const judges: Array<[metric: string, prompt: string | null]> = [];

  if (artifact.runner === "chat") {
    judges.push(["binary_judge_chat_grounding", chatGroundingPrompt(fixture, artifact)]);
    if (artifact.citations.length > 0) {
      judges.push(["binary_judge_citation_valid", chatCitationPrompt(fixture, artifact)]);
    }
  }

  if (artifact.runner === "research") {
    judges.push(["binary_judge_research_grounding", researchGroundingPrompt(fixture, artifact)]);
    if (artifact.researchPlan?.subQuestions?.length) {
      judges.push(["binary_judge_research_plan", researchPlanPrompt(fixture, artifact)]);
    }
  }

  if (artifact.runner === "literatureReview") {
    judges.push(["binary_judge_lr_sections", studioStructurePrompt(fixture, artifact)]);
  }

  if (isStudioRunner(artifact.runner)) {
    judges.push(["binary_judge_studio_structure", studioStructurePrompt(fixture, artifact)]);
    judges.push([
      "binary_judge_studio_grounding",
      studioGroundingPrompt(fixture, artifact, options.sourceTexts),
    ]);
  }

  // Independent judges of one artifact run concurrently; results keep the order above.
  const consistencySample = options.judgeConsistencySample ?? 0;
  return Promise.all(
    judges.map(([metric, prompt]) =>
      prompt === null
        ? Promise.resolve(noGroundingEvidence(fixture, artifact, model))
        : runBinaryJudge(metric, fixture, artifact, prompt, invoke, model, consistencySample)
    )
  );
}

export { parseBinaryResponse };
