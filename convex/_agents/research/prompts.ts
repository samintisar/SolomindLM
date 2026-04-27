"use node";

import { z } from "zod";
import type { SourceChannel } from "./types";

// ============================================================
// Zod Schemas
// ============================================================

export const SubQuestionSchema = z.object({
  id: z.string().describe("Short ID like sq1, sq2"),
  question: z.string().describe("Clear, specific sub-question"),
  searchQueries: z.array(z.string()).describe("2-3 search queries optimized for each channel"),
  sourceChannels: z.array(z.string()).describe("Target channels: notebook, web, academic, news"),
});

export const PlannerOutputSchema = z.object({
  subQuestions: z
    .array(SubQuestionSchema)
    .min(3)
    .max(7)
    .describe("3-7 focused sub-questions"),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

// ============================================================
// Prompt Templates
// ============================================================

export function buildPlanPrompt(query: string, enabledChannels: SourceChannel[]): string {
  const channelList = enabledChannels.join(", ");
  return `You are a research planner. Decompose the user's question into 3-7 focused sub-questions that together will comprehensively answer it.

USER QUESTION:
${query}

ENABLED SOURCE CHANNELS: ${channelList}

For each sub-question:
- Write a clear, specific question
- Provide 2-3 search queries optimized for each relevant source channel
- Assign source channels based on where the best evidence would come from (use only from: ${channelList})
- Use concise IDs like "sq1", "sq2", etc.

Guidelines:
- Start with the most important sub-questions first
- Each sub-question should be independently answerable
- Prefer specific, measurable questions over vague ones
- Include at least one sub-question that directly addresses the user's core question`;
}

export function buildWriterPrompt(
  query: string,
  subQuestions: Array<{ id: string; question: string }>,
  evidenceBySubQuestion: Record<string, Array<{ sourceTitle: string; sourceUrl?: string; content: string; sourceType: string }>>
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

  return `You are a research writer. Synthesize the evidence below into a comprehensive, well-structured answer to the user's question.

USER QUESTION:
${query}

EVIDENCE BY SUB-QUESTION:
${subQuestionSection}

Requirements:
- Write in clear, well-organized prose with headers for each major section
- Cite sources inline using [N] notation matching the **global** evidence numbers above (single sequence across all sub-questions, starting at [1])
- If evidence is weak or missing for a sub-question, acknowledge it explicitly
- Do NOT fabricate information — only use the provided evidence
- Start with a brief summary, then address each sub-question in detail
- End with a concise conclusion that directly answers the user's question`;
}
