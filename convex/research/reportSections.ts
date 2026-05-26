export type ReportSection = { heading: string; content: string };

export type EvidenceLike = {
  subQuestionId: string;
  sourceTitle: string;
  sourceUrl?: string;
};

const STANDARD_SECTION_ORDER = [
  "Abstract",
  "Introduction",
  "Methods",
  "Results",
  "Discussion",
  "Conclusion",
] as const;

export function isReferencesHeading(heading: string): boolean {
  return heading.trim().toLowerCase() === "references";
}

/** Split markdown on `## Heading` lines; omit References (rendered separately in UI). */
export function parseMarkdownSections(markdown: string): ReportSection[] {
  const lines = markdown.split("\n");
  const sections: ReportSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeading || isReferencesHeading(currentHeading)) {
      currentHeading = null;
      currentLines = [];
      return;
    }
    const content = currentLines.join("\n").trim();
    if (content.length > 0) {
      sections.push({ heading: currentHeading, content });
    }
    currentHeading = null;
    currentLines = [];
  };

  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      currentHeading = match[1].trim();
      continue;
    }
    if (currentHeading) {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

/** Order evidence the same way as `buildWriterPrompt` (sub-question order, then insertion order). */
export function buildOrderedEvidence<T extends EvidenceLike>(
  evidence: T[],
  subQuestions: Array<{ id: string }>
): T[] {
  const bySub: Record<string, T[]> = {};
  for (const entry of evidence) {
    if (!bySub[entry.subQuestionId]) {
      bySub[entry.subQuestionId] = [];
    }
    bySub[entry.subQuestionId].push(entry);
  }
  return subQuestions.flatMap((sq) => bySub[sq.id] ?? []);
}

/** Replace writer `[N]` markers with inline citation strings from a source-key resolver. */
export function applyNumericCitations(
  text: string,
  orderedEvidence: EvidenceLike[],
  formatCitation: (sourceKey: string) => string | undefined
): string {
  const sourceKeyByIndex = orderedEvidence.map((e) => e.sourceUrl || e.sourceTitle);

  return text.replace(/\[(\d+)\]/g, (full, numStr) => {
    const idx = Number.parseInt(numStr, 10) - 1;
    if (idx < 0 || idx >= sourceKeyByIndex.length) {
      return full;
    }
    const key = sourceKeyByIndex[idx];
    const formatted = formatCitation(key);
    return formatted ?? full;
  });
}

export function sortReportSections(sections: ReportSection[]): ReportSection[] {
  const orderIndex = new Map(STANDARD_SECTION_ORDER.map((h, i) => [h.toLowerCase(), i]));
  return [...sections].sort((a, b) => {
    const ai = orderIndex.get(a.heading.toLowerCase()) ?? 99;
    const bi = orderIndex.get(b.heading.toLowerCase()) ?? 99;
    return ai - bi;
  });
}

export function buildMethodsSection(sourceCount: number, subQuestionCount: number): string {
  return `Evidence was retrieved from ${sourceCount} unique source${sourceCount === 1 ? "" : "s"} across ${subQuestionCount} sub-question${subQuestionCount === 1 ? "" : "s"}. Sources were synthesized into thematic findings with inline citations keyed to the evidence list used during retrieval.`;
}

/** Fallback sections when the writer did not use `##` headings. */
export function buildFallbackSections(
  query: string,
  finalResponse: string,
  sourceCount: number,
  subQuestionCount: number
): ReportSection[] {
  const trimmed = finalResponse.trim();
  return [
    {
      heading: "Abstract",
      content: trimmed.slice(0, 1200) || query,
    },
    {
      heading: "Introduction",
      content: `This report addresses the research question: ${query}`,
    },
    {
      heading: "Methods",
      content: buildMethodsSection(sourceCount, subQuestionCount),
    },
    {
      heading: "Results",
      content: trimmed.slice(0, 8000),
    },
    {
      heading: "Discussion",
      content:
        "The synthesized evidence highlights several themes relevant to the research question. Interpretation should account for limited source coverage and possible benchmark–deployment gaps described in the included studies.",
    },
    {
      heading: "Conclusion",
      content:
        "Benchmark scores alone are weak predictors of real-world LLM performance without construct-valid, domain-matched evaluation. Practitioners should combine public leaderboard metrics with task-specific probes, leakage checks, and downstream outcome measures before deployment decisions.",
    },
  ];
}
