"use node";
/**
 * Prompt templates and schemas for WikiGraph.
 *
 * Contains all prompt template functions, Zod schemas, and constants
 * related to wiki knowledge base compilation.
 */

import { z } from "zod";

// ============================================================
// SCHEMAS
// ============================================================

/**
 * Schema for concept extraction from source content.
 */
export const ConceptExtractionSchema = z.object({
  concepts: z.array(
    z.object({
      name: z.string().describe("Short specific title, not a broad category"),
      summary: z.string().describe("One sentence, ≤160 chars"),
      importance: z.enum(["high", "medium", "low"]).describe("high = central to sources"),
      description: z.string().describe("≤400 chars: definition + why it matters"),
      relatedConcepts: z.array(z.string()).describe("0–6 other names from this chunk only"),
    })
  ),
});

/**
 * Minimal LLM output for a concept article. Path, type, title, sources, slug, lastUpdated are filled server-side.
 */
export const WikiArticleGenerationSchema = z.object({
  summary: z.string().describe("Index line, ≤120 chars, factual"),
  relatedConcepts: z
    .array(z.string())
    .describe("0–8 related concept names (not paths); omit noise"),
  content: z
    .string()
    .describe(
      "Markdown body only (no YAML). Natural structure: lead with definition, use headers only when warranted. Link related concepts as [[Name]]. ≤600 words for high-importance, ≤150 for low. Use ' not \" in prose."
    ),
});

/**
 * Schema for connection detection between concepts.
 */
export const ConnectionDetectionSchema = z.object({
  connections: z.array(
    z.object({
      path: z.string().describe("connections/slug-two-or-three-words"),
      title: z.string().describe("≤80 chars, names the link between concepts"),
      relationship: z.string().describe("≤350 chars: how they interact; no preamble"),
      concepts: z.array(z.string()).describe("2–3 paths: concepts/slug"),
      importance: z.enum(["high", "medium", "low"]),
    })
  ),
});

// ============================================================
// TYPES
// ============================================================

export interface ConceptExtraction {
  name: string;
  summary: string;
  importance: "high" | "medium" | "low";
  description: string;
  relatedConcepts: string[];
}

export interface WikiArticle {
  path: string;
  type: "concept" | "connection" | "qa" | "index" | "log";
  title: string;
  content: string;
  frontmatter: {
    slug: string;
    summary: string;
    sources: string[];
    relatedConcepts: string[];
    lastUpdated: string;
  };
}

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for concept extraction phase */
export const CONCEPT_EXTRACTION_SYSTEM_PROMPT =
  "Extract distinct, lookup-worthy concepts from the chunk. Be specific; omit fluff. Output JSON only per schema.";

/** System prompt for article generation phase */
export const ARTICLE_GENERATION_SYSTEM_PROMPT = `You are compiling a personal knowledge base wiki. Write articles like a brilliant colleague would write internal documentation — clear, direct, substantive.

Guidelines:
- Lead with a 1–2 sentence definition or summary
- Use headers naturally, only when the content warrants them
- Include concrete examples, numbers, or formulas when present in sources
- Link related concepts using [[Concept Name]] syntax
- Cite sources inline as [doc-id] not in a separate section
- Length should match importance: minor concept = 100 words, central concept = 600 words
- No boilerplate sections — if there's nothing to say under a heading, omit it entirely

Output JSON only per schema; content is markdown body without YAML.`;

/** System prompt for connection detection phase */
export const CONNECTION_DETECTION_SYSTEM_PROMPT =
  "Find a few non-obvious cross-concept links worth a standalone note. Output JSON only per schema.";

// ============================================================
// PROMPT TEMPLATES
// ============================================================

/**
 * Concept extraction prompt for analyzing source content.
 */
export const getConceptExtractionPrompt = (params: {
  content: string;
  documentCount: number;
  chunkIndex?: number;
  totalChunks?: number;
}): string => {
  const { content, documentCount, chunkIndex, totalChunks } = params;

  const chunkContext =
    chunkIndex !== undefined && totalChunks !== undefined
      ? `This is chunk ${chunkIndex + 1} of ${totalChunks}. Extract concepts from this chunk only - they will be merged with concepts from other chunks.`
      : "";

  return `Sources: ${documentCount} document(s). ${chunkContext}

Extract 3–7 concepts **from this chunk only**. Each: specific title (not "Programming"), one-line summary, importance, tight description (≤400 chars), related names also present in this chunk.

Text:
${content}`;
};

/**
 * Article generation prompt for creating wiki articles.
 */
export const getArticleGenerationPrompt = (params: {
  concept: ConceptExtraction;
  relevantContent: string;
  sources: string[];
  existingArticles?: string;
}): string => {
  const { concept, relevantContent, sources, existingArticles } = params;

  return `Concept: **${concept.name}** (${concept.importance})
Summary: ${concept.summary}
Detail: ${concept.description}
Hints: ${concept.relatedConcepts.join(", ") || "—"}

Sources excerpt:
${relevantContent}

${existingArticles ? `Other articles (cross-link where real):\n${existingArticles}\n` : ""}

Return JSON with:
- summary: one index line (≤120 chars)
- relatedConcepts: names only (0–8), no paths
- content: markdown body — lead with a 1–2 sentence definition. Use headers naturally (only when content warrants). Include [[wikilinks]] to related concepts inline. Embed examples, numbers, formulas from sources. ${concept.importance === "high" ? "Up to 600 words" : concept.importance === "low" ? "Up to 150 words" : "Up to 350 words"}. No YAML. Use apostrophes, not double quotes, in prose.`;
};

/**
 * Connection detection prompt for finding relationships.
 */
export const getConnectionDetectionPrompt = (params: {
  concepts: ConceptExtraction[];
  articles: string;
}): string => {
  const { concepts, articles } = params;

  const conceptList = concepts.map((c) => `- ${c.name} (${c.importance} importance)`).join("\n");

  return `Concepts:
${conceptList}

Articles:
${articles}

List 1–4 **non-obvious** links (dependency, flow, tradeoff, causal). Skip "co-mentioned only."
Each item: path \`connections/slug\`, short title, relationship ≤350 chars, concepts as \`concepts/<slug>\` for 2–3 articles, importance.`;
};
