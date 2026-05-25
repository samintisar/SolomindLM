"use node";

import { z } from "zod";
import type { SourceChannel } from "./types";

// ============================================================
// Zod Schemas
// ============================================================

export const SubQuestionSchema = z.object({
  id: z.string().describe("Short ID like sq1, sq2"),
  question: z.string().describe("Clear, specific sub-question"),
  searchQueries: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("1-3 targeted search queries with distinct angles (synonyms, methods, datasets)"),
  sourceChannels: z.array(z.string()).describe("Target channels: notebook, web, academic, news"),
});

export const PlannerOutputSchema = z.object({
  subQuestions: z
    .array(SubQuestionSchema)
    .min(3)
    .max(5)
    .describe("3-5 focused sub-questions that cover distinct angles of the research question"),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

// ============================================================
// Prompt Templates
// ============================================================

export function buildPlanPrompt(query: string, enabledChannels: SourceChannel[]): string {
  const channelList = enabledChannels.join(", ");
  return `You are a research planner. Decompose the user's question into 3-5 highly focused sub-questions that together will comprehensively answer it.

USER QUESTION:
${query}

ENABLED SOURCE CHANNELS: ${channelList}

For each sub-question:
- Write a clear, specific question
- Provide 1-3 search queries per sub-question (distinct angles, not duplicates)
- Assign source channels based on where the best evidence would come from (use only from: ${channelList})
  - Use "web" for general facts, concepts, and broad information
  - Use "news" ONLY for current events, recent developments, or time-sensitive facts
  - Use "academic" for research papers, studies, and scholarly sources
  - Use "notebook" for user's uploaded documents
- Use concise IDs like "sq1", "sq2", etc.

Guidelines:
- Start with the most important sub-questions first
- Each sub-question should be independently answerable
- Prefer specific, measurable questions over vague ones
- Include at least one sub-question that directly addresses the user's core question
- AVOID redundant or overlapping sub-questions — each should cover a distinct angle
- NEVER assign both "web" and "news" to the same sub-question; pick the one that fits better
- Limit to 3-5 sub-questions total; each must cover a distinct angle`;
}

export function buildWriterPrompt(
  query: string,
  subQuestions: Array<{ id: string; question: string }>,
  evidenceBySubQuestion: Record<
    string,
    Array<{ sourceTitle: string; sourceUrl?: string; content: string; sourceType: string }>
  >
): string {
  let globalN = 0;
  const subQuestionSection = subQuestions
    .map((sq) => {
      const evidence = evidenceBySubQuestion[sq.id] ?? [];
      const evidenceSection =
        evidence.length > 0
          ? evidence
              .map((e) => {
                globalN += 1;
                const n = globalN;
                return `[${n}] (${e.sourceType}: ${e.sourceTitle}${e.sourceUrl ? ` - ${e.sourceUrl}` : ""})\n${e.content}`;
              })
              .join("\n\n")
          : "No evidence found for this sub-question.";
      return `### ${sq.id}: ${sq.question}\n\n${evidenceSection}`;
    })
    .join("\n\n---\n\n");

  return `You are an expert research assistant. Write a clear, chat-native research answer to the user's question using ONLY the provided evidence.

USER QUESTION:
${query}

EVIDENCE BY SUB-QUESTION:
${subQuestionSection}

OUTPUT FORMAT:
- Write in Markdown for a chat message (not a formal literature review).
- Start with a direct answer to the question (2-4 sentences).
- Use ### subheadings only where they improve readability (e.g. key themes, limitations, practical takeaways).
- Target 800-1,500 words total.
- Cite sources inline using [N] notation matching the evidence numbers above. Every substantive claim needs a citation.
- Do NOT include a References or Sources section (citations and source lists are added by the UI).
- Do NOT fabricate studies, statistics, URLs, or quotes not supported by the evidence.
- If evidence is thin or conflicting, say so explicitly.
- End with a short "Limitations" or "What remains uncertain" subsection when appropriate.
`;
}
