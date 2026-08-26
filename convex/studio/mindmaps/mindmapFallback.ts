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

export function createSmartFallback(extractions: ConceptExtraction[]): FinalMindMap {
  const themeCounts: Record<string, number> = {};
  for (const extraction of extractions) {
    const theme = extraction.main_theme || "Unknown";
    themeCounts[theme] = (themeCounts[theme] || 0) + 1;
  }

  const rootTitle =
    Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Knowledge Map";

  const seenThemes = new Set<string>();
  const children: MindMapNode[] = [];

  for (const extraction of extractions) {
    const theme = extraction.main_theme || "Misc";
    if (seenThemes.has(theme)) continue;
    seenThemes.add(theme);

    const branchName = theme === rootTitle ? "Overview" : theme;
    const concepts = conceptsFromExtraction(extraction);

    children.push({
      topic: branchName,
      children:
        concepts.length > 0
          ? concepts.map((concept) => ({
              topic: concept,
              children: null,
            }))
          : null,
    });
  }

  return {
    nodeData: {
      topic: rootTitle,
      children: children.length > 0 ? children : null,
    },
  };
}
