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
    .max(2)
    .describe("1-2 highly targeted search queries (fewer precise queries beat many vague ones)"),
  sourceChannels: z.array(z.string()).describe("Target channels: notebook, web, academic, news"),
});

export const PlannerOutputSchema = z.object({
  subQuestions: z
    .array(SubQuestionSchema)
    .min(2)
    .max(3)
    .describe("2-3 highly focused sub-questions — fewer precise questions beat many vague ones"),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

// ============================================================
// Prompt Templates
// ============================================================

export function buildPlanPrompt(query: string, enabledChannels: SourceChannel[]): string {
  const channelList = enabledChannels.join(", ");
  return `You are a research planner. Decompose the user's question into 2-3 highly focused sub-questions that together will comprehensively answer it.

USER QUESTION:
${query}

ENABLED SOURCE CHANNELS: ${channelList}

For each sub-question:
- Write a clear, specific question
- Provide exactly 1 search query (highly targeted, not broad)
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
- Limit to 2-3 sub-questions total; fewer focused questions beat many vague ones`;
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

  return `You are an expert curriculum designer. Synthesize the evidence into a focused, actionable learning roadmap.

USER QUESTION:
${query}

EVIDENCE BY SUB-QUESTION:
${subQuestionSection}

OUTPUT FORMAT — produce ONLY this structure:

## Quick Overview (2-3 bullets)
- What the user needs to learn and why

## Learning Roadmap

### Phase 1: [Foundational Topic]
- **Key concepts**: 2-3 specific skills/concepts to master
- **Resources**: specific courses, papers, or tutorials from the evidence
- **Milestone**: how to verify they've learned this

### Phase 2: [Next Topic]
(same structure)

### Phase 3: [Advanced Topic]
(same structure)

## Projects to Build
- 2-3 concrete project ideas that combine multiple concepts

## Common Pitfalls to Avoid
- 2-3 mistakes beginners make at this stage

Requirements:
- STRICT LENGTH: 1000-2000 words maximum
- Cite sources inline using [N] notation matching the evidence numbers
- Do NOT fabricate information — only use provided evidence
- FOCUS on what to learn NEXT, not exhaustive theory
- Be SPECIFIC: name concrete techniques, papers, and tools
- If evidence is missing for a topic, provide the best guidance you can from the available evidence without calling attention to gaps
`;
}
