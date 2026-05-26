/**
 * Literature-review-specific quality metrics.
 *
 * Reads `artifact.studioOutput.raw` (the full `LiteratureReviewEvalResult`)
 * to compute stage-by-stage scores: search yield, deduplication, ranking
 * relevance, screening inclusion rate, extraction coverage, report citation
 * coverage, and expected-item recall in the report.
 */

import type {
  EvalFixture,
  EvalRunArtifact,
  EvalBaseline,
  MetricResult,
  MetricStatus,
} from "../types";
import type { LiteratureReviewEvalResult } from "../runners/literatureReviewRunner";
import { createTogetherJudgeInvoker } from "./togetherLlmJudge";

// ─── Helpers ────────────────────────────────────────────────────

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

function getRaw(artifact: EvalRunArtifact): LiteratureReviewEvalResult | undefined {
  return artifact.studioOutput?.raw as LiteratureReviewEvalResult | undefined;
}

/** Normalize text for keyword matching. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Common stopwords to ignore in query keyword extraction. */
const STOPWORDS = new Set([
  "what",
  "which",
  "where",
  "when",
  "why",
  "how",
  "who",
  "whom",
  "whose",
  "are",
  "were",
  "was",
  "is",
  "am",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "done",
  "can",
  "could",
  "would",
  "should",
  "shall",
  "will",
  "may",
  "might",
  "must",
  "need",
  "dare",
  "ought",
  "used",
  "this",
  "that",
  "these",
  "those",
  "they",
  "them",
  "their",
  "theirs",
  "themselves",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "he",
  "him",
  "his",
  "himself",
  "she",
  "her",
  "hers",
  "herself",
  "it",
  "its",
  "itself",
  "we",
  "us",
  "our",
  "ours",
  "ourselves",
  "i",
  "me",
  "my",
  "mine",
  "myself",
  "a",
  "an",
  "the",
  "and",
  "but",
  "or",
  "yet",
  "so",
  "for",
  "nor",
  "from",
  "into",
  "onto",
  "upon",
  "with",
  "within",
  "without",
  "about",
  "above",
  "across",
  "after",
  "against",
  "along",
  "among",
  "around",
  "at",
  "before",
  "behind",
  "below",
  "beneath",
  "beside",
  "between",
  "beyond",
  "by",
  "down",
  "during",
  "except",
  "inside",
  "instead",
  "into",
  "like",
  "near",
  "off",
  "on",
  "out",
  "outside",
  "over",
  "past",
  "since",
  "through",
  "throughout",
  "till",
  "to",
  "toward",
  "towards",
  "under",
  "underneath",
  "until",
  "up",
  "via",
  "exist",
  "exists",
  "existing",
]);

/** Generate simple stem variants for a keyword (e.g. removing -> remove). */
function stemVariants(word: string): string[] {
  const variants = [word];
  if (word.endsWith("ing")) variants.push(word.slice(0, -3));
  if (word.endsWith("ed")) variants.push(word.slice(0, -2));
  if (word.endsWith("es")) variants.push(word.slice(0, -2));
  if (word.endsWith("s") && word.length > 4) variants.push(word.slice(0, -1));
  return [...new Set(variants)];
}

/** Check if a paper's title/abstract contains query keywords. */
function paperMatchesQuery(paper: { title: string; abstract: string }, query: string): boolean {
  const normalizedQuery = normalize(query);
  const normalizedTitle = normalize(paper.title);
  const normalizedAbstract = normalize(paper.abstract);
  const text = normalizedTitle + " " + normalizedAbstract;

  // Extract meaningful keywords (stopwords and short words removed)
  const keywords = normalizedQuery.split(" ").filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  if (keywords.length === 0) return true;

  // Count matches, including simple stem variants
  let matched = 0;
  for (const kw of keywords) {
    const variants = stemVariants(kw);
    if (variants.some((v) => text.includes(v))) {
      matched++;
    }
  }

  // Match if at least one third of keywords are present (lenient for long natural-language queries)
  return matched >= Math.ceil(keywords.length / 3);
}

// ─── 1. Search Yield ────────────────────────────────────────────

/**
 * Papers found per search query.
 * Pass if >= 3 papers per query on average.
 */
export function lrSearchYield(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const searchQueries = raw?.searchQueries ?? [];
  const found = raw?.counts.found ?? 0;

  if (searchQueries.length === 0) {
    return baseMetric(
      "lr_search_yield",
      fixture,
      artifact,
      "fail",
      0,
      "No search queries generated.",
      { found, queryCount: 0 }
    );
  }

  const yieldPerQuery = found / searchQueries.length;
  let status: MetricStatus;
  if (yieldPerQuery >= 3) status = "pass";
  else if (yieldPerQuery >= 1) status = "warn";
  else status = "fail";

  return baseMetric(
    "lr_search_yield",
    fixture,
    artifact,
    status,
    yieldPerQuery / 3, // normalize to 0-1 scale
    `${found} papers from ${searchQueries.length} queries (${yieldPerQuery.toFixed(1)} per query).`,
    { found, queryCount: searchQueries.length, yieldPerQuery }
  );
}

// ─── 2. Deduplication Ratio ─────────────────────────────────────

/**
 * Ratio of papers removed by deduplication.
 * Info-only metric to track whether dedup is working.
 */
export function lrDeduplicationRatio(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const found = raw?.counts.found ?? 0;
  const deduped = raw?.counts.deduplicated ?? 0;

  if (found === 0) {
    return baseMetric(
      "lr_deduplication_ratio",
      fixture,
      artifact,
      "info",
      0,
      "No papers found; deduplication not applicable.",
      { found, deduped, ratio: 0 }
    );
  }

  const ratio = (found - deduped) / found;
  return baseMetric(
    "lr_deduplication_ratio",
    fixture,
    artifact,
    "info",
    ratio,
    `${found - deduped}/${found} papers removed by deduplication (${(ratio * 100).toFixed(1)}%).`,
    { found, deduped, removed: found - deduped, ratio }
  );
}

// ─── 3. Ranking Top Relevance ───────────────────────────────────

/**
 * Check whether top-5 ranked papers contain query keywords.
 * Pass if >= 3/5 match.
 */
export function lrRankingTopRelevance(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const ranked = raw?.stagePapers.ranked ?? [];
  const query = fixture.question;

  if (ranked.length === 0) {
    return baseMetric(
      "lr_ranking_top_relevance",
      fixture,
      artifact,
      "fail",
      0,
      "No ranked papers to evaluate.",
      { top5Relevant: 0 }
    );
  }

  const top5 = ranked.slice(0, 5);
  const relevantCount = top5.filter((p) => paperMatchesQuery(p, query)).length;
  const score = top5.length === 0 ? 0 : relevantCount / top5.length;

  let status: MetricStatus;
  if (relevantCount >= 3) status = "pass";
  else if (relevantCount >= 1) status = "warn";
  else status = "fail";

  return baseMetric(
    "lr_ranking_top_relevance",
    fixture,
    artifact,
    status,
    score,
    `${relevantCount}/${top5.length} top-ranked papers match query keywords.`,
    { top5Relevant: relevantCount, top5Total: top5.length, score }
  );
}

// ─── 4. Screening Inclusion Rate ────────────────────────────────

/**
 * Ratio of screened papers that were included.
 * Warn if < 0.2 (too restrictive) or > 0.9 (too lax).
 */
export function lrScreeningInclusionRate(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const screened = raw?.counts.screened ?? 0;
  const included = raw?.counts.included ?? 0;

  if (screened === 0) {
    return baseMetric(
      "lr_screening_inclusion_rate",
      fixture,
      artifact,
      "info",
      0,
      "No papers screened.",
      { screened, included, rate: 0 }
    );
  }

  const rate = included / screened;
  let status: MetricStatus;
  if (rate >= 0.2 && rate <= 0.95) status = "pass";
  else if (rate >= 0.1) status = "warn";
  else status = "fail";

  return baseMetric(
    "lr_screening_inclusion_rate",
    fixture,
    artifact,
    status,
    rate,
    `${included}/${screened} papers included (${(rate * 100).toFixed(1)}%).`,
    { screened, included, rate }
  );
}

// ─── 5. Extraction Coverage ─────────────────────────────────────

/**
 * % of custom column cells with non-empty, non-trivial data.
 * Pass if >= 0.8, warn if >= 0.5.
 */
export function lrExtractionCoverage(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const coverage = raw?.extractionCoverage ?? [];

  if (coverage.length === 0) {
    return baseMetric(
      "lr_extraction_coverage",
      fixture,
      artifact,
      "info",
      0,
      "No custom columns to evaluate extraction coverage.",
      { overallCoverage: 0, columnCount: 0 }
    );
  }

  const totalCells = coverage.reduce((sum, c) => sum + c.totalCount, 0);
  const filledCells = coverage.reduce((sum, c) => sum + c.filledCount, 0);
  const overallCoverage = totalCells === 0 ? 0 : filledCells / totalCells;

  let status: MetricStatus;
  if (overallCoverage >= 0.8) status = "pass";
  else if (overallCoverage >= 0.5) status = "warn";
  else status = "fail";

  return baseMetric(
    "lr_extraction_coverage",
    fixture,
    artifact,
    status,
    overallCoverage,
    `${filledCells}/${totalCells} custom column cells filled (${(overallCoverage * 100).toFixed(1)}%).`,
    {
      overallCoverage,
      filledCells,
      totalCells,
      columnBreakdown: coverage,
    }
  );
}

// ─── 6. Extraction Depth ────────────────────────────────────────

/**
 * Average length of extracted text per cell.
 * Info-only metric to track extraction verbosity.
 */
export function lrExtractionDepth(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const samples = raw?.extractionSamples ?? [];

  if (samples.length === 0) {
    return baseMetric(
      "lr_extraction_depth",
      fixture,
      artifact,
      "info",
      0,
      "No extraction samples to evaluate depth.",
      { avgLength: 0, sampleCount: 0 }
    );
  }

  const lengths = samples.map((s) => s.extractedValue.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  return baseMetric(
    "lr_extraction_depth",
    fixture,
    artifact,
    "info",
    avgLength / 200, // rough normalization
    `Average extracted text length: ${avgLength.toFixed(0)} chars across ${samples.length} samples.`,
    { avgLength, sampleCount: samples.length, lengths }
  );
}

// ─── 7. Report Citation Coverage ────────────────────────────────

/**
 * Check whether the report cites papers that appear in the table.
 * Pass if >= 80% of table papers are cited in the report.
 */
export function lrReportCitationCoverage(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const tablePapers = raw?.table.papers ?? [];
  const reportContent = raw?.report.content ?? "";

  if (tablePapers.length === 0) {
    return baseMetric(
      "lr_report_citation_coverage",
      fixture,
      artifact,
      "info",
      0,
      "No papers in table to check citation coverage.",
      { citedCount: 0, tableCount: 0 }
    );
  }

  const normalizedReport = normalize(reportContent);
  let citedCount = 0;
  const paperCitations: Array<{ title: string; cited: boolean }> = [];

  for (const paper of tablePapers) {
    const title = paper.rowData["title"] ?? "";
    const cited = normalize(title)
      .split(" ")
      .filter((w) => w.length >= 5)
      .some((word) => normalizedReport.includes(word));
    if (cited) citedCount++;
    paperCitations.push({ title, cited });
  }

  const coverage = tablePapers.length === 0 ? 0 : citedCount / tablePapers.length;

  let status: MetricStatus;
  if (coverage >= 0.8) status = "pass";
  else if (coverage >= 0.5) status = "warn";
  else status = "fail";

  return baseMetric(
    "lr_report_citation_coverage",
    fixture,
    artifact,
    status,
    coverage,
    `${citedCount}/${tablePapers.length} table papers cited in report (${(coverage * 100).toFixed(1)}%).`,
    { citedCount, tableCount: tablePapers.length, coverage, paperCitations }
  );
}

// ─── 8. Expected Item Recall (report content) ───────────────────

/**
 * Check if fixture.expectedItems appear in the report content.
 * Same scoring as chat expected_item_recall.
 */
export function lrExpectedItemRecall(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const reportContent = raw?.report.content ?? "";
  const reportAndAnswer = artifact.answer + "\n" + reportContent;

  if (fixture.expectedItems.length === 0) {
    return baseMetric(
      "lr_expected_item_recall",
      fixture,
      artifact,
      "pass",
      1,
      "No expected items — recall checked via expectedAnswer / LLM judge only.",
      { matched: [], unmatched: [] }
    );
  }

  const normalizedText = normalize(reportAndAnswer);
  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const item of fixture.expectedItems) {
    const normalizedItem = normalize(item);
    const keywords = normalizedItem.split(" ").filter((w) => w.length >= 3);
    const found = keywords.length === 0 || keywords.some((kw) => normalizedText.includes(kw));
    if (found) matched.push(item);
    else unmatched.push(item);
  }

  const score =
    fixture.expectedItems.length === 0 ? 1 : matched.length / fixture.expectedItems.length;

  let status: MetricStatus;
  if (score >= 0.9) status = "pass";
  else if (score >= 0.7) status = "warn";
  else status = "fail";

  const detail =
    unmatched.length === 0
      ? `All ${matched.length} expected items found in report/answer.`
      : `Found ${matched.length}/${fixture.expectedItems.length} expected items. Missing: ${unmatched.join(", ")}`;

  return baseMetric("lr_expected_item_recall", fixture, artifact, status, score, detail, {
    matched,
    unmatched,
  });
}

// ─── LLM Judge Metrics ──────────────────────────────────────────

interface JudgeResponse {
  score: number;
  reasoning: string;
}

function parseJudgeResponse(content: string): JudgeResponse {
  try {
    const parsed = JSON.parse(content);
    return {
      score: typeof parsed.score === "number" ? Math.max(0, Math.min(1, parsed.score)) : 0.5,
      reasoning: String(parsed.reasoning ?? parsed.explanation ?? "No reasoning provided."),
    };
  } catch {
    // Fallback: try to extract a number from the text
    const match = content.match(/(\d\.?\d*)/);
    const score = match ? parseFloat(match[1]) : 0.5;
    return { score: Math.max(0, Math.min(1, score)), reasoning: content.slice(0, 200) };
  }
}

/**
 * LLM judge: rate the literature review report on coherence, structure,
 * and coverage of included papers.
 */
export async function lrLlmJudgeReportQuality(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): Promise<MetricResult> {
  const raw = getRaw(artifact);
  const reportContent = raw?.report.content ?? "";
  const includedCount = raw?.counts.included ?? 0;

  if (reportContent.length === 0) {
    return baseMetric(
      "lr_llm_judge_report_quality",
      fixture,
      artifact,
      "fail",
      0,
      "Report is empty; cannot evaluate quality.",
      { score: 0 }
    );
  }

  // Sample from beginning and end so the judge sees both intro and conclusion sections
  const sampleLimit = 3500;
  const reportSample =
    reportContent.length <= sampleLimit * 2
      ? reportContent
      : reportContent.slice(0, sampleLimit) +
        "\n\n[...middle sections omitted...]\n\n" +
        reportContent.slice(-sampleLimit);

  const prompt = `You are evaluating a literature review report. Rate it on a scale of 0 to 1 for:
1. Coherence: Does the report flow logically?
2. Structure: Does it have clear sections (Abstract, Introduction, Methods, Results, Discussion, Conclusion)?
3. Coverage: Does it cover the ${includedCount} included papers meaningfully?

Report content sample:
${reportSample}

Respond with JSON: {"score": number, "reasoning": string}`;

  try {
    const invoker = createTogetherJudgeInvoker({ model: "openai/gpt-oss-20b" });
    const response = await invoker(prompt);
    const judged = parseJudgeResponse(response);

    let status: MetricStatus;
    if (judged.score >= 0.8) status = "pass";
    else if (judged.score >= 0.6) status = "warn";
    else status = "fail";

    return baseMetric(
      "lr_llm_judge_report_quality",
      fixture,
      artifact,
      status,
      judged.score,
      `LLM judge score: ${judged.score.toFixed(2)}. ${judged.reasoning}`,
      { score: judged.score, reasoning: judged.reasoning }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return baseMetric(
      "lr_llm_judge_report_quality",
      fixture,
      artifact,
      "fail",
      0,
      `LLM judge failed: ${message}`,
      { error: message }
    );
  }
}

/**
 * LLM judge: evaluate report completeness against expected behavior.
 * Uses a larger context window than the generic llmJudgeCompleteness
 * because literature review reports are long and the key synthesis
 * may appear in the middle or end sections.
 */
export async function lrLlmJudgeCompleteness(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): Promise<MetricResult> {
  const raw = getRaw(artifact);
  const reportContent = raw?.report.content ?? "";

  if (reportContent.length === 0) {
    return baseMetric(
      "lr_llm_judge_completeness",
      fixture,
      artifact,
      "fail",
      0,
      "Report is empty; cannot evaluate completeness.",
      { score: 0 }
    );
  }

  // Sample from beginning and end so the judge sees intro and conclusion/synthesis
  const sampleLimit = 4000;
  const reportSample =
    reportContent.length <= sampleLimit * 2
      ? reportContent
      : reportContent.slice(0, sampleLimit) +
        "\n\n[...middle sections omitted...]\n\n" +
        reportContent.slice(-sampleLimit);

  const prompt = `You are evaluating the completeness of a literature review report.

**Research Question:** ${fixture.question}

**Expected Behavior:** ${fixture.expectedBehavior}

**Report Content Sample:**
${reportSample}

Did the report fully address the expected behavior?
Check for:
- Missing key information or categories
- Incomplete explanations
- Unaddressed parts of the question

If the report covers the major categories/approaches implied by the question, it should pass.

Respond with JSON: {"score": number, "reasoning": string}`;

  try {
    const invoker = createTogetherJudgeInvoker({ model: "openai/gpt-oss-20b" });
    const response = await invoker(prompt);
    const judged = parseJudgeResponse(response);

    let status: MetricStatus;
    if (judged.score >= 0.8) status = "pass";
    else if (judged.score >= 0.6) status = "warn";
    else status = "fail";

    return baseMetric(
      "lr_llm_judge_completeness",
      fixture,
      artifact,
      status,
      judged.score,
      `LLM judge score: ${judged.score.toFixed(2)}. ${judged.reasoning}`,
      { score: judged.score, reasoning: judged.reasoning }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return baseMetric(
      "lr_llm_judge_completeness",
      fixture,
      artifact,
      "fail",
      0,
      `LLM judge failed: ${message}`,
      { error: message }
    );
  }
}

/**
 * LLM judge: evaluate extraction accuracy on sampled cells.
 */
export async function lrLlmJudgeExtractionQuality(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): Promise<MetricResult> {
  const raw = getRaw(artifact);
  const samples = raw?.extractionSamples ?? [];

  if (samples.length === 0) {
    return baseMetric(
      "lr_llm_judge_extraction_quality",
      fixture,
      artifact,
      "info",
      0,
      "No extraction samples to evaluate.",
      { sampleCount: 0 }
    );
  }

  const invoker = createTogetherJudgeInvoker({ model: "openai/gpt-oss-20b" });
  const judgments: Array<{ sample: string; score: number; reasoning: string }> = [];

  for (const sample of samples.slice(0, 3)) {
    const prompt = `You are evaluating data extraction from academic papers.
Paper title: ${sample.paperTitle}
Column: ${sample.columnName}
Extracted value: ${sample.extractedValue.slice(0, 500)}

Rate whether this extraction is accurate and faithful to what would be found in the paper.
0 = completely wrong or hallucinated
1 = perfectly accurate

Respond with JSON: {"score": number, "reasoning": string}`;

    try {
      const response = await invoker(prompt);
      const judged = parseJudgeResponse(response);
      judgments.push({
        sample: `${sample.paperTitle} / ${sample.columnName}`,
        score: judged.score,
        reasoning: judged.reasoning,
      });
    } catch (err) {
      judgments.push({
        sample: `${sample.paperTitle} / ${sample.columnName}`,
        score: 0,
        reasoning: `Judge error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const avgScore = judgments.reduce((s, j) => s + j.score, 0) / judgments.length;

  let status: MetricStatus;
  if (avgScore >= 0.8) status = "pass";
  else if (avgScore >= 0.6) status = "warn";
  else status = "fail";

  return baseMetric(
    "lr_llm_judge_extraction_quality",
    fixture,
    artifact,
    status,
    avgScore,
    `Avg extraction accuracy: ${avgScore.toFixed(2)} across ${judgments.length} samples.`,
    { avgScore, judgments }
  );
}

// ─── Aggregator ─────────────────────────────────────────────────

/** Run all deterministic literature review metrics. */
const CITATION_KEY_PATTERN = /\[([^\]]+)\]/g;

/** Every inline citation key must appear in stage paper titles or known keys. */
export function lrCitationKeyValidity(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const content = raw?.report.content ?? "";
  const allowed = new Set<string>();
  for (const p of raw?.table.papers ?? []) {
    const titleWords = p.rowData.title?.split(/\s+/) ?? [];
    for (const w of titleWords) {
      if (w.length >= 5) allowed.add(w.toLowerCase());
    }
  }

  const keys: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(CITATION_KEY_PATTERN.source, "g");
  while ((match = re.exec(content)) !== null) {
    keys.push(match[1].trim());
  }

  if (keys.length === 0) {
    return baseMetric(
      "lr_citation_key_validity",
      fixture,
      artifact,
      "warn",
      0.5,
      "No bracket citations found in report.",
      { keys: [] }
    );
  }

  const invalid = keys.filter((k) => {
    if (/^\d+$/.test(k)) return false;
    if (k.includes(",")) return true;
    if (k.length < 4) return true;
    const authorPart = k.replace(/\d{4}$/, "").toLowerCase();
    return authorPart.length < 2;
  });

  const score = invalid.length === 0 ? 1 : Math.max(0, 1 - invalid.length / keys.length);
  const status: MetricStatus = invalid.length === 0 ? "pass" : score >= 0.8 ? "warn" : "fail";

  return baseMetric(
    "lr_citation_key_validity",
    fixture,
    artifact,
    status,
    score,
    invalid.length === 0
      ? `All ${keys.length} citation keys look well-formed.`
      : `Invalid citation keys: ${invalid.slice(0, 5).join(", ")}`,
    { invalid, total: keys.length }
  );
}

/** Required report section headings for generated literature review reports. */
export function lrRequiredSectionNames(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const headings = (raw?.report.sections ?? []).map((s) => s.heading.trim().toLowerCase());
  const required = [
    "abstract",
    "introduction",
    "methods",
    "results",
    "discussion",
    "conclusion",
  ];
  const missing = required.filter((r) => !headings.includes(r));
  const score = required.length === 0 ? 1 : (required.length - missing.length) / required.length;
  const status: MetricStatus = missing.length === 0 ? "pass" : missing.length <= 1 ? "warn" : "fail";

  return baseMetric(
    "lr_required_section_names",
    fixture,
    artifact,
    status,
    score,
    missing.length === 0
      ? "All required section headings present."
      : `Missing sections: ${missing.join(", ")}`,
    { missing, headings }
  );
}

export function lrSummaryOfEvidencePresent(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const content = (raw?.report.content ?? "").toLowerCase();
  const resultsSection =
    raw?.report.sections.find((s) => s.heading.toLowerCase() === "results")?.content.toLowerCase() ??
    "";
  const haystack = content + resultsSection;
  const hasTable =
    haystack.includes("summary of evidence") &&
    (haystack.includes("effect direction") || haystack.includes("| theme |"));
  return baseMetric(
    "lr_summary_of_evidence_present",
    fixture,
    artifact,
    hasTable ? "pass" : "warn",
    hasTable ? 1 : 0,
    hasTable ? "Summary of Evidence section/table found." : "Summary of Evidence not detected.",
    { hasTable }
  );
}

function extractNumericTokensForEval(text: string): string[] {
  const tokens = new Set<string>();
  const patterns = [
    /\b\d+(?:\.\d+)?\s*%/g,
    /\br\s*[=≈]\s*0?\.\d+/gi,
    /\bF1\s*[=:]\s*0?\.\d+/gi,
    /\b0?\.\d{2,4}\b/g,
    /\b\d{1,4}\b/g,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        tokens.add(m.replace(/\s+/g, " ").trim().toLowerCase());
      }
    }
  }
  return [...tokens];
}

function buildGroundedNumericSetForEval(raw: LiteratureReviewEvalResult): Set<string> {
  const tokens = new Set<string>();
  const prov = raw.workflowProvenance ?? {};
  const countParts = [
    prov.recordsIdentified,
    prov.recordsAfterDedupe,
    prov.recordsScreened,
    prov.recordsIncluded,
    prov.recordsExcluded,
    prov.extractedRowCount,
    raw.counts.found,
    raw.counts.deduplicated,
    raw.counts.screened,
    raw.counts.included,
    raw.counts.extractedRows,
  ];
  for (const n of countParts) {
    if (n != null) {
      for (const t of extractNumericTokensForEval(String(n))) tokens.add(t);
    }
  }
  for (const paper of raw.table.papers) {
    for (const value of Object.values(paper.rowData)) {
      for (const t of extractNumericTokensForEval(value)) tokens.add(t);
    }
  }
  return tokens;
}

function findUngroundedNumericClaimsForEval(content: string, grounded: Set<string>): string[] {
  const claims = extractNumericTokensForEval(content);
  const ungrounded: string[] = [];
  for (const claim of claims) {
    if (claim.length < 2) continue;
    let found = grounded.has(claim);
    if (!found) {
      for (const g of grounded) {
        if (g.includes(claim) || claim.includes(g)) {
          found = true;
          break;
        }
      }
    }
    if (!found && /\d/.test(claim)) {
      ungrounded.push(claim);
    }
  }
  return [...new Set(ungrounded)].slice(0, 20);
}

/** Reported percentages/correlations/F1 values should appear in extraction or workflow stats. */
export function lrNumericGrounding(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const content = raw?.report.content ?? "";
  if (!raw || content.length === 0) {
    return baseMetric(
      "lr_numeric_grounding",
      fixture,
      artifact,
      "info",
      0,
      "No report content to evaluate numeric grounding.",
      { ungrounded: [] }
    );
  }

  const grounded = buildGroundedNumericSetForEval(raw);
  const ungrounded = findUngroundedNumericClaimsForEval(content, grounded);
  const claims = extractNumericTokensForEval(content).filter((c) => c.length >= 2 && /\d/.test(c));
  const score =
    claims.length === 0 ? 1 : Math.max(0, 1 - ungrounded.length / Math.max(claims.length, 1));
  const status: MetricStatus =
    ungrounded.length === 0 ? "pass" : score >= 0.85 ? "warn" : "fail";

  return baseMetric(
    "lr_numeric_grounding",
    fixture,
    artifact,
    status,
    score,
    ungrounded.length === 0
      ? `Numeric claims appear grounded (${claims.length} tokens checked).`
      : `Ungrounded numeric tokens: ${ungrounded.slice(0, 5).join(", ")}`,
    { ungrounded, claimCount: claims.length }
  );
}

export function lrPrismaConsistency(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const raw = getRaw(artifact);
  const prov = raw?.workflowProvenance;
  const found = prov?.recordsIdentified ?? raw?.counts.found ?? 0;
  const deduplicated = prov?.recordsAfterDedupe ?? raw?.counts.deduplicated ?? 0;
  const screened = prov?.recordsScreened ?? raw?.counts.screened ?? 0;
  const included = prov?.recordsIncluded ?? raw?.counts.included ?? 0;
  const methods =
    raw?.report.sections.find((s) => s.heading.toLowerCase() === "methods")?.content ?? "";

  let arithmeticOk = true;
  if (included > screened) arithmeticOk = false;
  if (screened > deduplicated && deduplicated > 0) arithmeticOk = false;
  if (deduplicated > found && found > 0) arithmeticOk = false;

  const mentionsIncluded = methods.includes(String(included));
  const provMatchesCounts =
    prov?.recordsIncluded == null || prov.recordsIncluded === (raw?.counts.included ?? 0);
  const score =
    (arithmeticOk ? 0.5 : 0) +
    (mentionsIncluded && included > 0 ? 0.3 : 0) +
    (provMatchesCounts ? 0.2 : 0);
  const status: MetricStatus = score >= 0.9 ? "pass" : score >= 0.5 ? "warn" : "fail";

  return baseMetric(
    "lr_prisma_consistency",
    fixture,
    artifact,
    status,
    score,
    arithmeticOk
      ? `PRISMA counts consistent (included=${included}, screened=${screened}).`
      : `PRISMA count ordering violated.`,
    { found, deduplicated, screened, included, mentionsIncluded, arithmeticOk, provMatchesCounts }
  );
}

export function scoreLiteratureReviewMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  baseline?: EvalBaseline
): MetricResult[] {
  return [
    lrSearchYield(fixture, artifact, baseline),
    lrDeduplicationRatio(fixture, artifact, baseline),
    lrRankingTopRelevance(fixture, artifact, baseline),
    lrScreeningInclusionRate(fixture, artifact, baseline),
    lrExtractionCoverage(fixture, artifact, baseline),
    lrExtractionDepth(fixture, artifact, baseline),
    lrReportCitationCoverage(fixture, artifact, baseline),
    lrCitationKeyValidity(fixture, artifact, baseline),
    lrRequiredSectionNames(fixture, artifact, baseline),
    lrSummaryOfEvidencePresent(fixture, artifact, baseline),
    lrPrismaConsistency(fixture, artifact, baseline),
    lrNumericGrounding(fixture, artifact, baseline),
    lrExpectedItemRecall(fixture, artifact, baseline),
  ];
}

/** Run all LLM-judge literature review metrics. */
export async function scoreLiteratureReviewLlmJudgeMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  baseline?: EvalBaseline
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];
  results.push(await lrLlmJudgeReportQuality(fixture, artifact, baseline));
  results.push(await lrLlmJudgeCompleteness(fixture, artifact, baseline));
  results.push(await lrLlmJudgeExtractionQuality(fixture, artifact, baseline));
  return results;
}
