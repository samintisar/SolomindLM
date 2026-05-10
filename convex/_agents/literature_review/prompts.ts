"use node";
/**
 * Prompt templates for the literature review agent.
 *
 * Each prompt is designed for structured JSON output where specified.
 */

// ============================================================
// PLAN REVIEW PROMPT
// ============================================================

/**
 * Given a research question, suggest 3-5 targeted search queries
 * and 4-6 column definitions for data extraction.
 */
export const PLAN_REVIEW_PROMPT = `You are a systematic review methodologist. Given a research question, produce a search plan and extraction schema.

RESEARCH QUESTION: "{query}"

Respond in the following JSON format:

\`\`\`json
{
  "searchQueries": [
    "query 1",
    "query 2",
    "query 3"
  ],
  "suggestedColumns": [
    {
      "id": "study_design",
      "name": "Study Design",
      "instructions": "Describe the study design (e.g., RCT, cohort, case-control, cross-sectional, systematic review).",
      "isVisible": true
    },
    {
      "id": "sample_size",
      "name": "Sample Size",
      "instructions": "Extract the total number of participants or samples. If multiple groups, report each.",
      "isVisible": true
    },
    {
      "id": "key_findings",
      "name": "Key Findings",
      "instructions": "Summarize the primary results or conclusions in 1-2 sentences.",
      "isVisible": true
    },
    {
      "id": "limitations",
      "name": "Limitations",
      "instructions": "List any limitations the authors acknowledge or that are evident (e.g., small sample, selection bias).",
      "isVisible": true
    },
    {
      "id": "methodology",
      "name": "Methodology",
      "instructions": "Briefly describe the methods, instruments, or analytical techniques used.",
      "isVisible": true
    }
  ]
}
\`\`\`

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
export const SCREEN_PAPERS_PROMPT = `You are a systematic review screener. Evaluate each paper against the research question and decide whether to include it for full-text review.

RESEARCH QUESTION: "{query}"

PAPERS TO SCREEN:
{papers}

For each paper, respond with an inclusion decision.

Respond in the following JSON format:

\`\`\`json
{
  "decisions": [
    {
      "paperId": "paper_1",
      "isIncluded": true,
      "reason": "Directly addresses the research question with relevant population and intervention."
    },
    {
      "paperId": "paper_2",
      "isIncluded": false,
      "reason": "Conference abstract only; insufficient detail for data extraction."
    }
  ]
}
\`\`\`

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
export const EXTRACT_DATA_PROMPT = `You are a data extraction specialist for systematic reviews. Extract the requested information from the paper for each defined column.

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

Respond in the following JSON format:

\`\`\`json
{
  "extractedData": {
    "study_design": "Randomized controlled trial",
    "sample_size": "N = 245 (intervention: 123, control: 122)",
    "key_findings": "Intervention group showed 30% improvement in primary outcome (p < 0.001).",
    "limitations": "Single-center study, short follow-up period (6 months).",
    "methodology": "Double-blind, placebo-controlled RCT with intention-to-treat analysis."
  }
}
\`\`\`

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
 * generate 400-600 words with inline citations.
 */
export const GENERATE_REPORT_SECTION_PROMPT = `You are an academic writer composing a section of a systematic review report.

SECTION: "{section}"
RESEARCH QUESTION: "{query}"

EXTRACTED DATA:
{extractedData}

CITATIONS:
{citations}

Write 400-600 words for this section. Use inline citations in the format [Author, Year] or [Number] to reference the papers.

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
