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

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for plan review (search queries + column suggestions) */
export const PLAN_REVIEW_SYSTEM_PROMPT = `You are a systematic review methodologist. Output strictly in JSON.`;

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

Respond in the following JSON format exactly:

{\n  "searchQueries": [\n    "query 1",\n    "query 2",\n    "query 3"\n  ],\n  "suggestedColumns": [\n    {\n      "id": "study_design",\n      "name": "Study Design",\n      "instructions": "Describe the study design (e.g., RCT, cohort, case-control, cross-sectional, systematic review).",\n      "isVisible": true\n    },\n    {\n      "id": "sample_size",\n      "name": "Sample Size",\n      "instructions": "Extract the total number of participants or samples. If multiple groups, report each.",\n      "isVisible": true\n    },\n    {\n      "id": "key_findings",\n      "name": "Key Findings",\n      "instructions": "Summarize the primary results or conclusions in 1-2 sentences.",\n      "isVisible": true\n    },\n    {\n      "id": "limitations",\n      "name": "Limitations",\n      "instructions": "List any limitations the authors acknowledge or that are evident (e.g., small sample, selection bias).",\n      "isVisible": true\n    },\n    {\n      "id": "methodology",\n      "name": "Methodology",\n      "instructions": "Briefly describe the methods, instruments, or analytical techniques used.",\n      "isVisible": true\n    }\n  ]\n}

Guidelines:
- Provide 3-5 distinct search queries that cover different aspects of the research question.
- Suggest 4-6 extraction columns relevant to the question.
- Column IDs should be lowercase snake_case.
- Column names should be human-readable.
- Instructions should be specific enough for consistent extraction.
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
- Include papers that directly address the research question.
- Exclude review articles, editorials, commentaries, and opinion pieces unless they are systematic reviews.
- Exclude papers without accessible full text or with insufficient methodological detail.
- Exclude papers in languages other than English unless translation is available.
- Exclude duplicate publications (keep the most complete version).
- If unsure, include the paper and note the uncertainty in the reason.

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
If the information is not available or not applicable, use "N/A".
Keep extractions concise but complete (1-3 sentences per cell).

Respond in the following JSON format exactly:

{\n  "extractedData": {\n    "study_design": "Randomized controlled trial",\n    "sample_size": "N = 245 (intervention: 123, control: 122)",\n    "key_findings": "Intervention group showed 30% improvement in primary outcome (p < 0.001).",\n    "limitations": "Single-center study, short follow-up period (6 months).",\n    "methodology": "Double-blind, placebo-controlled RCT with intention-to-treat analysis."\n  }\n}

Guidelines:
- Use "N/A" for missing or inapplicable fields.
- Do not invent data not present in the paper.
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

EXTRACTED DATA:
{extractedData}

CITATIONS:
{citations}

Write the appropriate length for the section type (Abstract: 150-250 words, other sections: 400-600 words). Use inline citations in the format [Author, Year] or [Number] to reference the papers.

Section-specific guidance:
- Abstract: Summarize the review purpose, methods, key findings, and conclusions (150-250 words).
- Introduction: Provide background, state the research question, and outline the review scope.
- Methods: Describe the search strategy, inclusion criteria, screening process, and data extraction approach.
- Results: Summarize the included studies, their characteristics, and the synthesized findings. Use subheadings if helpful.
- Discussion: Interpret the findings, discuss strengths and limitations, compare with prior work, and note implications.
- Conclusion: State the main conclusions, practical implications, and recommendations for future research.

Formatting:
- Use Markdown formatting (headers, bold, bullet points).
- Integrate citations naturally within the text.
- If no studies support a particular point, state this explicitly.
- Maintain an objective, academic tone throughout.

MARKDOWN OUTPUT:`;
