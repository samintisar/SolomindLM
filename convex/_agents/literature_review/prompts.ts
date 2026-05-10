"use node";

import { z } from "zod";

// ============================================================
// Zod Schemas
// ============================================================

export const SuggestedColumnSchema = z.object({
  id: z.string().describe("Short kebab-case ID like 'study-design'"),
  name: z.string().describe("Human-readable column name"),
  instructions: z
    .string()
    .optional()
    .describe("Instructions for LLM extraction — what to look for in the paper"),
});

export const PlanOutputSchema = z.object({
  searchQueries: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe("3-5 targeted search queries for academic databases"),
  suggestedColumns: z
    .array(SuggestedColumnSchema)
    .min(3)
    .max(8)
    .describe("4-6 relevant columns for the comparison table"),
});

export type PlanOutput = z.infer<typeof PlanOutputSchema>;

export const ScreeningDecisionSchema = z.object({
  paperId: z.string(),
  isIncluded: z.boolean(),
  reason: z.string().describe("Brief justification for inclusion/exclusion decision"),
});

export const ScreeningOutputSchema = z.object({
  decisions: z.array(ScreeningDecisionSchema),
});

export type ScreeningOutput = z.infer<typeof ScreeningOutputSchema>;

export const ExtractionOutputSchema = z.object({
  extractions: z.array(
    z.object({
      paperId: z.string(),
      columnId: z.string(),
      content: z.string().describe("Extracted content for this column"),
    })
  ),
});

export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export const ReportSectionSchema = z.object({
  heading: z.string(),
  content: z.string().describe("400-600 words for this section"),
});

export type ReportSectionOutput = z.infer<typeof ReportSectionSchema>;

// ============================================================
// Prompt Templates
// ============================================================

export function buildPlanPrompt(query: string): string {
  return `You are a systematic review planner. Given a research question, decompose it into targeted search queries and suggest comparison table columns.

RESEARCH QUESTION:
${query}

OUTPUT FORMAT — produce ONLY valid JSON matching this structure:
{
  "searchQueries": ["query 1", "query 2", ...],
  "suggestedColumns": [
    { "id": "short-id", "name": "Column Name", "instructions": "What to extract" }
  ]
}

GUIDELINES:
- Search queries: 3-5 highly specific queries that will find relevant academic papers
- Columns: 4-6 comparison dimensions that would be most useful for answering this question
- Column IDs: use kebab-case (e.g., "study-design", "sample-size")
- Include these system columns automatically (don't list them): paper_title, authors, year
- Custom columns should have clear extraction instructions
- Focus on what distinguishes papers in this domain
- Avoid overly broad columns like "summary" — be specific`;
}

export function buildScreeningPrompt(
  query: string,
  papers: Array<{ paperId: string; title: string; abstract: string }>
): string {
  const papersBlock = papers
    .map(
      (p, i) => `--- Paper ${i + 1} ---
ID: ${p.paperId}
Title: ${p.title}
Abstract: ${p.abstract.substring(0, 800)}`
    )
    .join("\n\n");

  return `You are a systematic review screener. Evaluate each paper for eligibility against the research question using PRISMA-style criteria.

RESEARCH QUESTION:
${query}

PAPERS TO SCREEN:
${papersBlock}

INCLUSION CRITERIA (include if ALL apply):
1. Directly relevant to the research question
2. Academic/scholarly source (peer-reviewed preferred)
3. Contains empirical data or substantive analysis (not just an abstract or editorial)
4. Published in the last 20 years (unless it's a seminal foundational work)

EXCLUSION CRITERIA (exclude if ANY apply):
1. Off-topic or tangential to the research question
2. Non-academic source without peer review
3. Purely an abstract, editorial, or opinion piece without data
4. Duplicate or near-duplicate of another paper

OUTPUT FORMAT — produce ONLY valid JSON:
{
  "decisions": [
    { "paperId": "...", "isIncluded": true/false, "reason": "brief justification" }
  ]
}

Guidelines:
- Be STRICT: exclude papers that are only marginally relevant
- The research question is specific — don't include papers that only tangentially touch the topic
- Provide a clear 1-sentence justification for each decision`;
}

export function buildExtractionPrompt(
  query: string,
  columns: Array<{ id: string; name: string; instructions?: string }>,
  papers: Array<{ paperId: string; title: string; abstract: string }>
): string {
  const columnsBlock = columns
    .map(
      (c) => `- ${c.name} (id: ${c.id})${c.instructions ? `: ${c.instructions}` : ""}`
    )
    .join("\n");

  const papersBlock = papers
    .map(
      (p, i) => `--- Paper ${i + 1} ---
ID: ${p.paperId}
Title: ${p.title}
Abstract: ${p.abstract.substring(0, 1200)}`
    )
    .join("\n\n");

  return `You are a research data extractor. Extract specific information from academic papers for a structured comparison table.

RESEARCH QUESTION:
${query}

COLUMNS TO EXTRACT:
${columnsBlock}

PAPERS TO EXTRACT:
${papersBlock}

OUTPUT FORMAT — produce ONLY valid JSON:
{
  "extractions": [
    { "paperId": "...", "columnId": "...", "content": "extracted content" }
  ]
}

Guidelines:
- Extract EVERY column for EVERY paper
- If information is not in the abstract, infer from title or write "Not specified in abstract"
- Keep extractions concise (1-3 sentences)
- Be factual — don't hallucinate information not in the abstract
- Use consistent formatting across papers`;
}

export function buildReportSectionPrompt(
  section: string,
  query: string,
  papers: Array<{ title: string; authors: string[]; year?: number; extractedData: Record<string, string> }>,
  citationKeys: Record<string, string>
): string {
  const papersBlock = papers
    .map((p) => {
      const key = citationKeys[p.title] || "Unknown";
      const dataStr = Object.entries(p.extractedData)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");
      return `[${key}] ${p.title} (${p.year || "n.d."})\n${dataStr}`;
    })
    .join("\n\n");

  const sectionInstructions: Record<string, string> = {
    abstract:
      "Write a 400-600 word structured abstract summarizing the review's purpose, methods, key findings, and implications.",
    introduction:
      "Introduce the research question, its significance, and what this review aims to synthesize (400-600 words).",
    methods:
      "Describe the search strategy, inclusion/exclusion criteria, and data extraction approach (400-600 words).",
    results:
      "Synthesize the main findings across studies, highlighting patterns, agreements, and contradictions (400-600 words).",
    discussion:
      "Interpret the findings, discuss limitations, and suggest implications for future research (400-600 words).",
    conclusion:
      "Summarize the key takeaways and practical recommendations (400-600 words).",
  };

  return `You are writing a formal academic literature review. Write the ${section.toUpperCase()} section.

RESEARCH QUESTION:
${query}

EXTRACTED PAPER DATA:
${papersBlock}

SECTION INSTRUCTIONS:
${sectionInstructions[section] || "Write a comprehensive section (400-600 words)."}

REQUIREMENTS:
- Length: 400-600 words for each section
- Use inline citations like [Smith2024] matching the citation keys provided
- Synthesize across papers — don't just summarize each paper individually
- Be objective and evidence-based
- Use formal academic tone
- DO NOT fabricate information — only use the provided extracted data`;
}
