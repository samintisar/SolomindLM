"use node";
/**
 * Prompt templates for the literature review agent.
 *
 * Each prompt is designed for structured JSON output where specified.
 */

import { z } from "zod";
import { MARKDOWN_MATH_NOTATION_FOR_APP } from "../_shared/markdownMathPrompt.js";

// ============================================================
// ZOD SCHEMAS (for structured LLM output validation)
// ============================================================

/**
 * Schema for screening decisions output.
 */
export const ScreenPapersOutputSchema = z.object({
  decisions: z.array(
    z.object({
      paperId: z.string(),
      isIncluded: z.boolean(),
      reason: z.string(),
    })
  ),
});

export type ScreenPapersOutput = z.infer<typeof ScreenPapersOutputSchema>;

/** One paper per LLM call (faster, avoids batch timeouts). */
export const ScreenSinglePaperOutputSchema = z.object({
  isIncluded: z.boolean(),
  reason: z.string(),
});

export type ScreenSinglePaperOutput = z.infer<typeof ScreenSinglePaperOutputSchema>;

/**
 * Schema for data extraction output.
 */
export const ExtractDataOutputSchema = z.object({
  extractedData: z.record(z.string(), z.string()),
});

export type ExtractDataOutput = z.infer<typeof ExtractDataOutputSchema>;

/**
 * Schema for plan review output (search queries + suggested columns).
 */
export const PlanReviewOutputSchema = z.object({
  /** Short academic title for the review (not the raw user prompt). */
  reviewTitle: z.string(),
  searchQueries: z.array(z.string()),
  suggestedColumns: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      instructions: z.string().optional(),
      isVisible: z.boolean(),
    })
  ),
});

export type PlanReviewOutput = z.infer<typeof PlanReviewOutputSchema>;

/**
 * Schema for generating all report sections in a single call.
 */
export const GenerateFullReportOutputSchema = z.object({
  sections: z.array(
    z.object({
      heading: z.string(),
      content: z.string(),
    })
  ),
});

export type GenerateFullReportOutput = z.infer<typeof GenerateFullReportOutputSchema>;

/** Shared citation and grounding rules for report generation. */
export const REPORT_CITATION_AND_GROUNDING_RULES = `
CITATION RULES (mandatory):
- Use ONLY citation keys exactly as listed in CITATIONS (e.g. [Kim2026], [Smith2024]).
- Never invent author names, years, or citation keys not in CITATIONS.
- Do not use [Author, Year] free-form citations.

NUMERIC GROUNDING (mandatory):
- Do not state Pearson r, percentages, F1 scores, sample sizes, or counts unless the value appears in EXTRACTED DATA or SESSION METADATA.
- If a metric is not quantified in the source data, write "not quantified in included studies".
- Methods PRISMA counts must match SESSION METADATA exactly when cited.

STRUCTURE:
- Results: organize thematic subsections (### headings). Include a ### Summary of Evidence markdown table with columns: Theme | Key finding | Applicability | Effect direction | Confidence | Supporting studies.
- Discussion: use ### Principal Findings, ### Comparison With Existing Literature, ### Practical Implications (researchers, developers, practitioners, regulators), ### Strengths and Limitations, ### Gaps and Future Directions.

MARKDOWN FORMAT (mandatory):
- Do NOT repeat the section name (Abstract, Introduction, Results, etc.) inside section content — the UI already shows it as the section title.
- Put every ### subsection heading on its own line with a blank line before it. Never embed headings mid-sentence (wrong: "text ### Heading"; correct: blank line then "### Heading" on its own line).
- Tables: one row per line; single | between columns; include a separator row (e.g. |---|---|). Never use ||| or || as row breaks.
`;

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for plan review (search queries + column suggestions) */
export const PLAN_REVIEW_SYSTEM_PROMPT = `You are a systematic review methodologist. Output strictly in JSON.

For suggestedColumns: every column must be tailored to the user's research question — names and extraction instructions should reflect the concepts, entities, and outcomes needed to answer that question. Do not reuse a generic methodology checklist unless the question is explicitly about comparing study designs across papers.`;

/** System prompt for screening papers */
export const SCREEN_PAPERS_SYSTEM_PROMPT = `You are a systematic review screener. Output strictly in JSON.`;

/** System prompt for data extraction */
export const EXTRACT_DATA_SYSTEM_PROMPT = `You are a data extraction specialist for systematic reviews. Output strictly in JSON.`;

/** System prompt for report section generation */
export const GENERATE_REPORT_SECTION_SYSTEM_PROMPT = `You are an academic writer composing a section of a systematic review report.

CRITICAL OUTPUT FORMAT: You MUST output your response in MARKDOWN text format, NOT JSON. Use markdown headers, bullet points, and standard formatting. Do NOT output JSON objects or arrays.

${MARKDOWN_MATH_NOTATION_FOR_APP}`;

// ============================================================
// PLAN REVIEW PROMPT
// ============================================================

/**
 * Given a research question, suggest 3-5 targeted search queries
 * and 4-6 column definitions for data extraction.
 */
export const PLAN_REVIEW_PROMPT = `CRITICAL OUTPUT FORMAT: You MUST output valid JSON only. Do not include markdown code blocks, explanations, or any text outside the JSON object. The JSON must be parseable by a standard JSON parser.

RESEARCH QUESTION: "{query}"

Respond in the following JSON format exactly (shape only — replace every placeholder with content specific to the research question):

{\n  "reviewTitle": "Concise Academic Title for This Review",\n  "searchQueries": [\n    "targeted search query 1",\n    "targeted search query 2",\n    "targeted search query 3",\n    "targeted search query 4",\n    "targeted search query 5"\n  ],\n  "suggestedColumns": [\n    {\n      "id": "first_concept_snake_case",\n      "name": "First Concept Label",\n      "instructions": "What to extract for this concept, tied to the research question.",\n      "isVisible": true\n    },\n    {\n      "id": "second_concept_snake_case",\n      "name": "Second Concept Label",\n      "instructions": "What to extract for this concept, tied to the research question.",\n      "isVisible": true\n    }\n  ]\n}

Guidelines:
- reviewTitle: A concise, professional title (max 12 words) that names the review topic. Use title case. Do NOT copy the user's full prompt, instructions (e.g. "include RCT evidence"), or question marks. Focus on the subject (e.g. "Digital Interventions for Depression" not "What digital interventions exist for treating depression? Include RCT evidence").
- First, identify the major categories, approaches, or subtopics implied by the research question.
- Then provide 5-7 distinct search queries, with each query targeting a different category, approach, or aspect. Ensure comprehensive coverage across the topic space.
- For broad survey questions, include queries for each major technological or methodological variant you can identify.
- Suggest 4-6 extraction columns that help answer the research question. Each column should capture a distinct concept the user needs to compare across papers (e.g. for "How reliable are LLM evaluation benchmarks at predicting real-world performance?" use columns like Benchmark Name & Type, Predictive Validity, Benchmark Limitations — not generic Study Design / Sample Size / Key Findings / Limitations / Methodology).
- Do NOT default to generic methodology columns (Study Design, Sample Size, Key Findings, Limitations, Methodology) unless the research question is explicitly about study methods or epidemiology.
- Column IDs should be lowercase snake_case derived from the column name.
- Column names should be human-readable and question-specific.
- Instructions should tell the extractor exactly what to pull from each paper for this review.
- All columns should have isVisible: true by default.

JSON OUTPUT:`;

// ============================================================
// SCREEN PAPERS PROMPT
// ============================================================

/**
 * Given a batch of papers and a research question, output
 * inclusion/exclusion decisions with reasons.
 */
export const SCREEN_PAPERS_PROMPT = `CRITICAL OUTPUT FORMAT: You MUST output valid JSON only. Do not include markdown code blocks, explanations, or any text outside the JSON object. The JSON must be parseable by a standard JSON parser.

RESEARCH QUESTION: "{query}"

PAPERS TO SCREEN:
{papers}

For each paper, respond with an inclusion decision.

Respond in the following JSON format exactly:

{\n  "decisions": [\n    {\n      "paperId": "paper_1",\n      "isIncluded": true,\n      "reason": "Directly addresses the research question with relevant population and intervention."\n    },\n    {\n      "paperId": "paper_2",\n      "isIncluded": false,\n      "reason": "Conference abstract only; insufficient detail for data extraction."\n    }\n  ]\n}

Screening criteria:
- Include papers that DIRECTLY address the research question with clear relevance and provide substantive information.
- Exclude papers that are only tangentially related or address a different topic.
- Do NOT automatically exclude review articles, surveys, or overview papers. For broad research questions asking about technologies, methods, or approaches, review articles can be highly relevant and should be included if they directly address the question with comprehensive coverage.
- Exclude editorials, commentaries, and opinion pieces unless they contain substantial evidence-based analysis.
- Exclude papers without accessible full text or with insufficient detail to extract meaningful information.
- Exclude papers in languages other than English unless translation is available.
- Exclude duplicate publications (keep the most complete version).
- Be selective: if a paper's relevance is unclear, marginal, or provides only superficial coverage, EXCLUDE it and note the uncertainty.
- Aim for a balanced inclusion rate: include papers that clearly contribute to answering the research question, but exclude those with weak or indirect relevance.

JSON OUTPUT:`;

export const SCREEN_SINGLE_PAPER_PROMPT = `CRITICAL OUTPUT FORMAT: You MUST output valid JSON only.

RESEARCH QUESTION: "{query}"

PAPER:
Title: {title}
Abstract: {abstract}

Decide if this paper should be included in a systematic review for the research question.

Respond in the following JSON format exactly:

{\n  "isIncluded": true,\n  "reason": "One sentence explaining the decision."\n}

Be selective: exclude tangential papers, editorials without evidence, and duplicates. Include review/survey papers when they directly address the question.

JSON OUTPUT:`;

// ============================================================
// EXTRACT DATA PROMPT
// ============================================================

/**
 * Given a paper and column definitions, extract data for each column.
 */
export const EXTRACT_DATA_PROMPT = `CRITICAL OUTPUT FORMAT: You MUST output valid JSON only. Do not include markdown code blocks, explanations, or any text outside the JSON object. The JSON must be parseable by a standard JSON parser.

RESEARCH QUESTION: "{query}"

PAPER:
Title: {title}
Authors: {authors}
Year: {year}
Abstract: {abstract}
URL: {url}

EXTRACTION COLUMNS:
{columns}

For each column, extract the relevant information from the paper.
Use the abstract and title as your primary sources. If the exact information is not explicitly stated, infer it from context when reasonable (e.g., guess study design from methods described, estimate sample size from participant counts).
Only use "N/A" as a last resort when the information is truly impossible to infer from the available text.
Keep extractions concise but complete (1-3 sentences per cell).

Respond in the following JSON format exactly (use one key per column id from EXTRACTION COLUMNS above):

{\n  "extractedData": {\n    "column_id_from_definitions": "Extracted value for that column",\n    "another_column_id": "Another extracted value"\n  }\n}

Guidelines:
- Only use "N/A" when the information is completely absent and cannot be reasonably inferred.
- Do not invent data not present in the paper, but do make reasonable inferences from the abstract and title.
- For columns about paper title, citation, or "Paper Title & Year", always set the value to the PAPER title and year shown above (e.g. "Title Here (2024)").
- For methodology columns (retrieval approach, knowledge source, integration), infer from the abstract when not stated explicitly; prefer a short specific phrase over "N/A".
- For numeric values, include units where applicable.
- For multi-part answers, use semicolons to separate items.
- Maintain consistency with extraction instructions for each column.

JSON OUTPUT:`;

// ============================================================
// GENERATE REPORT SECTION PROMPT
// ============================================================

/**
 * Given a section name, extracted data, and research question,
 * generate the section with inline citations.
 */
export const GENERATE_REPORT_SECTION_PROMPT = `SECTION: "{section}"
RESEARCH QUESTION: "{query}"

SESSION METADATA:
{sessionMetadata}

EXTRACTED DATA:
{extractedData}

CITATIONS:
{citations}

${REPORT_CITATION_AND_GROUNDING_RULES}

Write the appropriate length for the section type (Abstract: 150-250 words, other sections: 400-600 words).

Section-specific guidance:
- Abstract: Summarize the review purpose, methods, key findings, and conclusions (150-250 words).
- Introduction: Provide background, state the research question, and outline the review scope.
- Methods: Describe the search strategy, inclusion criteria, screening process, and data extraction approach.
- Results: Summarize the included studies, their characteristics, and the synthesized findings. Organize by major categories, approaches, or methodological groups. Use subheadings to structure the synthesis. Compare and contrast different approaches where applicable.
- Discussion: Interpret the findings, discuss strengths and limitations, compare different approaches or categories, compare with prior work, and note implications. Highlight gaps where certain categories or approaches are underrepresented or absent from the included studies.
- Conclusion: State the main conclusions, practical implications, and recommendations for future research.

Formatting:
- Write body prose only for SECTION "{section}". Do NOT start with the section name or a # / ## line for that name (wrong: "## Abstract", "# Introduction", or a standalone "Abstract" title). The report UI already shows the section title.
- Use Markdown for subsections (###), bold, and bullet points inside the body.
- Integrate citations naturally within the text.
- If no studies support a particular point, state this explicitly.
- Maintain an objective, academic tone throughout.
- In Results and Discussion, explicitly group studies by their major approach, technology, or category and compare across groups.

MARKDOWN OUTPUT:`;

// ============================================================
// GENERATE FULL REPORT PROMPT (single-call mode)
// ============================================================

/**
 * Generate the complete literature review report in one structured call.
 * Produces all standard sections (Abstract, Introduction, Methods, Results, Discussion, Conclusion).
 */
export const GENERATE_FULL_REPORT_SYSTEM_PROMPT = `You are an academic writer composing a systematic review report.

CRITICAL OUTPUT FORMAT: You MUST output valid JSON only. Do not include markdown code blocks, explanations, or any text outside the JSON object. The JSON must be parseable by a standard JSON parser.

${MARKDOWN_MATH_NOTATION_FOR_APP}`;

export const GENERATE_FULL_REPORT_PROMPT = `RESEARCH QUESTION: "{query}"

SESSION METADATA:
{sessionMetadata}

EXTRACTED DATA:
{extractedData}

CITATIONS:
{citations}

${REPORT_CITATION_AND_GROUNDING_RULES}

Write a complete systematic review report with the following sections. Each section should use Markdown formatting within its content string. Mention paper titles when discussing specific studies and cite with exact keys from CITATIONS.

Sections to generate (do NOT duplicate the study characteristics table — PRISMA methods content is inserted separately):
1. Abstract (150-250 words): Summarize the review purpose, methods, key findings, and conclusions.
2. Introduction (300-400 words): Provide background, state the research question, and outline the review scope.
3. Methods (200-300 words): Describe inclusion criteria, screening process, and data extraction. Do not invent database names or counts; refer to SESSION METADATA for search queries and PRISMA counts.
4. Results (500-700 words): Thematic synthesis only (### subheadings). Include ### Summary of Evidence table. Do not duplicate a full per-study table.
5. Discussion (500-700 words): Use required ### subsections listed in STRUCTURE above.
6. Conclusion (200-300 words): State the main conclusions, practical implications, and recommendations for future research.

Formatting guidelines:
- Each section's "content" is body prose only. Do not repeat the section title as a heading line (## Abstract, etc.) — headings are stored separately.
- Use Markdown (### subsections, bold, bullet points, tables) inside the body.
- If no studies support a particular point, state this explicitly.
- Maintain an objective, academic tone throughout.
- Group studies by major approach, technology, or category and compare across groups.

Output valid JSON only: an object with a "sections" array; each item has "heading" (string) and "content" (string).
Include exactly these headings: Abstract, Introduction, Methods, Results, Discussion, Conclusion.

CRITICAL: Every "content" value must be complete, publication-ready prose meeting the word targets above. Do not output stub phrases (e.g. "content here", "Abstract content here"), ellipsis-only text, or angle-bracket templates.

JSON OUTPUT:`;
