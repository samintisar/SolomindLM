"use node";

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { parseMarkdownSections } from "./reportSections";
import {
  deepResearchReportTitle,
  fallbackResearchTitleFromQuery,
  normalizeResearchTitle,
} from "./titles";

/** Prompt prefix for FAST_LLM title generation (matches literature review report step). */
export function researchTitleChunk(query: string, contentSnippet: string): string {
  return `Deep research topic: ${query.trim()}\n\n${contentSnippet}`;
}

export function abstractSnippetFromResponse(finalResponse: string): string {
  const sections = parseMarkdownSections(finalResponse);
  const abstract =
    sections.find((s) => s.heading.toLowerCase() === "abstract")?.content ??
    finalResponse.slice(0, 2000);
  return abstract.trim() || finalResponse.slice(0, 2000);
}

/**
 * Resolve a display title: plan title if set, else FAST_LLM title from report content, else query heuristic.
 */
export async function resolveResearchTitle(
  ctx: ActionCtx,
  args: { query: string; researchTitle?: string; finalResponse?: string }
): Promise<string> {
  if (args.researchTitle?.trim()) {
    return normalizeResearchTitle(args.researchTitle);
  }

  const q = args.query.trim();
  if (!q) return normalizeResearchTitle("");

  const snippet = args.finalResponse
    ? abstractSnippetFromResponse(args.finalResponse)
    : q;

  try {
    const generated = await ctx.runAction(internal._services.ai.titleGenerator.generateTitle, {
      chunk: researchTitleChunk(q, snippet),
    });
    return normalizeResearchTitle(generated);
  } catch {
    return fallbackResearchTitleFromQuery(q);
  }
}

/** Base title for literature table/report rows (report variant strips report prefixes). */
export async function resolveResearchReportTitle(
  ctx: ActionCtx,
  args: { query: string; researchTitle?: string; finalResponse?: string }
): Promise<string> {
  const base = await resolveResearchTitle(ctx, args);
  return deepResearchReportTitle(base);
}
