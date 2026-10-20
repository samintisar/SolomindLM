import type { ConceptExtraction, FinalMindMap, MindMapNode } from "../../_agents/mindmap/state";

const MAX_FALLBACK_CONCEPTS = 12;
const MIN_SENTENCE_LENGTH = 20;
const MAX_CONCEPT_LENGTH = 200;

function clipConcept(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CONCEPT_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_CONCEPT_LENGTH).trim()}…`;
}

export function conceptsFromSource(summary: string): string[] {
  const paragraphs = summary
    .split(/\n\n+/)
    .map((part) => clipConcept(part))
    .filter((part) => part.length > 0);
  if (paragraphs.length >= 2) {
    return paragraphs.slice(0, MAX_FALLBACK_CONCEPTS);
  }

  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((part) => clipConcept(part))
    .filter((part) => part.length >= MIN_SENTENCE_LENGTH);
  if (sentences.length > 0) {
    return sentences.slice(0, MAX_FALLBACK_CONCEPTS);
  }

  const clipped = clipConcept(summary);
  return clipped.length > 0 ? [clipped] : [];
}

function conceptsFromExtraction(extraction: ConceptExtraction): string[] {
  if (extraction.key_concepts.length > 0) {
    return extraction.key_concepts;
  }
  return conceptsFromSource(extraction.summary);
}

/** Top-level branches in a fallback map: the themes most chunks share. */
export const MAX_FALLBACK_BRANCHES = 7;
/** Leaves under one fallback branch. */
export const MAX_FALLBACK_LEAVES = 8;

interface ThemeGroup {
  theme: string;
  count: number;
  concepts: string[];
}

/** Extractions grouped by theme (case-insensitive), most common first, ties by first appearance. */
function groupByTheme(extractions: ConceptExtraction[]): ThemeGroup[] {
  const groups = new Map<string, ThemeGroup>();
  for (const extraction of extractions) {
    const theme = extraction.main_theme?.trim() || "Misc";
    const key = theme.toLowerCase();
    const group = groups.get(key) ?? { theme, count: 0, concepts: [] };
    group.count++;
    for (const concept of conceptsFromExtraction(extraction)) {
      if (!group.concepts.some((c) => c.toLowerCase() === concept.toLowerCase())) {
        group.concepts.push(concept);
      }
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/**
 * A map built without the LLM when the reduce fails: the root is the most common theme, and the
 * branches are the most common themes (at most `MAX_FALLBACK_BRANCHES`), each with its first
 * `MAX_FALLBACK_LEAVES` distinct concepts. Themes that only one chunk raised drop out first, so a
 * failed reduce over many chunks still gives a readable map.
 */
export function createSmartFallback(extractions: ConceptExtraction[]): FinalMindMap {
  const groups = groupByTheme(extractions);
  const rootTitle = groups[0]?.theme || "Knowledge Map";

  const children: MindMapNode[] = groups.slice(0, MAX_FALLBACK_BRANCHES).map((group) => {
    const concepts = group.concepts.slice(0, MAX_FALLBACK_LEAVES);
    return {
      topic: group.theme === rootTitle ? "Overview" : group.theme,
      children:
        concepts.length > 0
          ? concepts.map((concept) => ({ topic: concept, children: null }))
          : null,
    };
  });

  return {
    nodeData: {
      topic: rootTitle,
      children: children.length > 0 ? children : null,
    },
  };
}

/** Reduce input for the second, smaller reduce attempt: themes and concepts, no summaries. */
export function compactReduceInput(extractions: ConceptExtraction[], maxChars = 60_000): string {
  return extractions
    .map((e) => `THEME: ${e.main_theme}\nCONCEPTS: ${e.key_concepts.join(", ")}`)
    .join("\n\n---\n\n")
    .slice(0, maxChars);
}
