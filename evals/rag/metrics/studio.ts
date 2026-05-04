/**
 * Studio-specific deterministic metric scorers.
 *
 * Reads `artifact.studioOutput.raw` for structural checks and the existing
 * `artifact.answer` (serialized text) for content checks. Returns the same
 * `MetricResult` shape as the RAG metrics so reports/aggregation work without
 * change.
 */
import type {
  EvalFixture,
  EvalRunArtifact,
  EvalBaseline,
  MetricResult,
  MetricStatus,
} from "../types";
import { evaluateInfographicWithVision } from "./visionJudge";

function baseMetric(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  status: MetricStatus,
  score: number,
  detail: string,
  breakdown?: Record<string, unknown>
): MetricResult {
  return {
    metric,
    caseId: fixture.id,
    runner: artifact.runner,
    configHash: artifact.configHash,
    status,
    score,
    detail,
    ...(breakdown ? { breakdown } : {}),
  };
}

// ─── Generic count gate ──────────────────────────────────────

function countGate(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  actual: number,
  expected: number | undefined,
  label: string
): MetricResult {
  if (expected == null) {
    return baseMetric(
      metric,
      fixture,
      artifact,
      "info",
      1,
      `${label} count: ${actual} (no minItems gate set).`,
      { actual }
    );
  }
  if (actual >= expected) {
    return baseMetric(
      metric,
      fixture,
      artifact,
      "pass",
      1,
      `${label} count ${actual} ≥ ${expected}.`,
      { actual, expected }
    );
  }
  const ratio = expected === 0 ? 1 : actual / expected;
  const status: MetricStatus = ratio >= 0.7 ? "warn" : "fail";
  return baseMetric(
    metric,
    fixture,
    artifact,
    status,
    ratio,
    `${label} count ${actual} below expected ${expected}.`,
    { actual, expected, ratio }
  );
}

// ─── Per-kind scorers ────────────────────────────────────────

interface ItemArrayPayload {
  cards?: unknown[];
  questions?: unknown[];
}

interface MindmapPayload {
  data?:
    | { nodeData?: { children?: unknown[] }; root?: { children?: unknown[] } }
    | { children?: unknown[] };
}

interface InfographicPayload {
  data?: { imageUrl?: string; title?: string; prompt?: string };
  title?: string;
  status?: string;
}

interface SpreadsheetPayload {
  data?: string | { rows?: unknown[]; columns?: unknown[]; headers?: unknown[] };
}

function flashcardCountMatch(
  fixture: EvalFixture,
  artifact: EvalRunArtifact
): MetricResult {
  const cards = (artifact.studioOutput?.raw as ItemArrayPayload | undefined)?.cards ?? [];
  return countGate(
    "flashcard_count_match",
    fixture,
    artifact,
    cards.length,
    fixture.expectedStructure?.minItems,
    "Flashcards"
  );
}

function quizCountMatch(fixture: EvalFixture, artifact: EvalRunArtifact): MetricResult {
  const qs = (artifact.studioOutput?.raw as ItemArrayPayload | undefined)?.questions ?? [];
  return countGate(
    "quiz_count_match",
    fixture,
    artifact,
    qs.length,
    fixture.expectedStructure?.minItems,
    "Quiz questions"
  );
}

function writtenQuestionsCountMatch(
  fixture: EvalFixture,
  artifact: EvalRunArtifact
): MetricResult {
  const qs = (artifact.studioOutput?.raw as ItemArrayPayload | undefined)?.questions ?? [];
  return countGate(
    "written_questions_count_match",
    fixture,
    artifact,
    qs.length,
    fixture.expectedStructure?.minItems,
    "Written questions"
  );
}

function countMindmapNodes(node: { children?: unknown[] } | undefined): number {
  if (!node) return 0;
  let count = 1;
  for (const child of node.children ?? []) {
    count += countMindmapNodes(child as { children?: unknown[] });
  }
  return count;
}

function mindmapNodeCount(fixture: EvalFixture, artifact: EvalRunArtifact): MetricResult {
  const data = (artifact.studioOutput?.raw as MindmapPayload | undefined)?.data;
  const wrapped = data as
    | { nodeData?: { children?: unknown[] }; root?: { children?: unknown[] } }
    | undefined;
  const root =
    wrapped?.nodeData ??
    wrapped?.root ??
    (data as { children?: unknown[] } | undefined);
  const total = countMindmapNodes(root as { children?: unknown[] });
  return countGate(
    "mindmap_node_count",
    fixture,
    artifact,
    total,
    fixture.expectedStructure?.minItems,
    "Mindmap nodes"
  );
}

function infographicHasImage(fixture: EvalFixture, artifact: EvalRunArtifact): MetricResult {
  const data = (artifact.studioOutput?.raw as InfographicPayload | undefined)?.data;
  const imageUrl = data?.imageUrl ?? "";
  const hasImage = imageUrl.length > 0 && imageUrl.startsWith("http");
  const passed = hasImage ? 1 : 0;
  const message = hasImage
    ? `Infographic generated with image URL: ${imageUrl.slice(0, 80)}...`
    : "Infographic did not generate an image URL.";
  return baseMetric(
    "infographic_image_generated",
    fixture,
    artifact,
    passed === 1 ? "pass" : "fail",
    passed,
    message
  );
}

function spreadsheetRowCount(
  fixture: EvalFixture,
  artifact: EvalRunArtifact
): MetricResult {
  const data = (artifact.studioOutput?.raw as SpreadsheetPayload | undefined)?.data;
  let rowCount = 0;
  if (typeof data === "string") {
    // CSV: first line is the header. Count non-empty data rows.
    const lines = data.split(/\r?\n/).filter((l) => l.trim().length > 0);
    rowCount = Math.max(0, lines.length - 1);
  } else if (data && Array.isArray(data.rows)) {
    rowCount = data.rows.length;
  }
  return countGate(
    "spreadsheet_row_count",
    fixture,
    artifact,
    rowCount,
    fixture.expectedStructure?.minItems,
    "Spreadsheet rows"
  );
}

// ─── Report: required-section presence ───────────────────────

function reportSectionPresence(
  fixture: EvalFixture,
  artifact: EvalRunArtifact
): MetricResult {
  const required = fixture.expectedStructure?.requiredSections;
  if (!required || required.length === 0) {
    return baseMetric(
      "report_section_presence",
      fixture,
      artifact,
      "info",
      1,
      "No requiredSections set — skipping section-presence check."
    );
  }
  const text = artifact.answer.toLowerCase();
  const missing = required.filter((s) => !text.includes(s.toLowerCase()));
  const found = required.length - missing.length;
  const score = required.length === 0 ? 1 : found / required.length;
  let status: MetricStatus;
  if (score >= 0.9) status = "pass";
  else if (score >= 0.6) status = "warn";
  else status = "fail";
  return baseMetric(
    "report_section_presence",
    fixture,
    artifact,
    status,
    score,
    missing.length === 0
      ? `All ${found} required sections present.`
      : `Missing ${missing.length}/${required.length} sections: ${missing.join(", ")}`,
    { found, required: required.length, missing }
  );
}

// ─── Audio script length sanity ──────────────────────────────

/** Target word counts per length setting */
const AUDIO_TARGET_WORDS: Record<string, number> = {
  short: 2000,
  default: 4400,
  long: 7000,
};

function audioScriptLength(
  fixture: EvalFixture,
  artifact: EvalRunArtifact
): MetricResult {
  const transcript =
    (artifact.studioOutput?.raw as { transcript?: string } | undefined)?.transcript ?? "";
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;

  // Check against length target if fixture specifies one
  const length = fixture.studioParams?.length ?? "default";
  const targetWords = AUDIO_TARGET_WORDS[length] ?? AUDIO_TARGET_WORDS.default;
  const ratio = wordCount / targetWords;

  let status: MetricStatus;
  if (ratio >= 0.9) status = "pass";
  else if (ratio >= 0.7) status = "warn";
  else status = "fail";

  return baseMetric(
    "audio_script_length",
    fixture,
    artifact,
    status,
    ratio,
    `Word count: ${wordCount} / target ${targetWords} (${length}) = ${(ratio * 100).toFixed(1)}%`,
    { wordCount, targetWords, length, ratio }
  );
}

// ─── Studio dispatcher ───────────────────────────────────────

/** Run all studio scorers applicable to the given artifact. */
export async function scoreStudioMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];
  if (!artifact.studioOutput) return results;

  switch (artifact.studioOutput.kind) {
    case "report":
      results.push(reportSectionPresence(fixture, artifact));
      break;
    case "flashcards":
      results.push(flashcardCountMatch(fixture, artifact));
      break;
    case "quiz":
      results.push(quizCountMatch(fixture, artifact));
      break;
    case "writtenQuestions":
      results.push(writtenQuestionsCountMatch(fixture, artifact));
      break;
    case "mindmap":
      results.push(mindmapNodeCount(fixture, artifact));
      break;
    case "infographic": {
      results.push(infographicHasImage(fixture, artifact));
      // Add vision-based evaluation
      const visionResults = await evaluateInfographicWithVision(fixture, artifact);
      results.push(...visionResults);
      break;
    }
    case "spreadsheet":
      results.push(spreadsheetRowCount(fixture, artifact));
      break;
    case "audioScript":
    case "audioScriptOnly":
      results.push(audioScriptLength(fixture, artifact));
      break;
    default:
      break;
  }
  return results;
}
