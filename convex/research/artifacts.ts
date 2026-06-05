import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { assertCanEditNotebook } from "../_lib/notebookAccess";
import { createCitationEngine, generateCitationKey } from "../_utils/CitationEngine";
import {
  applyNumericCitations,
  buildFallbackSections,
  buildMethodsSection,
  buildOrderedEvidence,
  parseMarkdownSections,
  type ReportSection,
  sortReportSections,
} from "./reportSections";
import {
  deepResearchReportTitle,
  deepResearchTableTitle,
  fallbackResearchTitleFromQuery,
} from "./titles";

function buildCitationFromEvidence(entry: {
  sourceType: string;
  sourceTitle: string;
  sourceUrl?: string;
  metadata?: {
    doi?: string;
    authors?: string[];
    year?: number;
    sourceApi?: "openalex" | "arxiv" | "pubmed" | "semantic_scholar";
    pdfUrl?: string;
    citationCount?: number;
  };
}): {
  paperId: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  url: string;
  sourceApi: "openalex" | "arxiv" | "semantic_scholar" | "pubmed";
} {
  const paperId = entry.metadata?.doi || entry.sourceUrl || entry.sourceTitle;
  const authors: string[] = entry.metadata?.authors || [];
  const year = entry.metadata?.year;

  const sourceApi: "openalex" | "arxiv" | "semantic_scholar" | "pubmed" =
    entry.sourceType === "academic" ? entry.metadata?.sourceApi || "arxiv" : "semantic_scholar";

  return {
    paperId: String(paperId),
    title: entry.sourceTitle,
    authors,
    year,
    doi: entry.metadata?.doi,
    url: entry.sourceUrl || "",
    sourceApi,
  };
}

export const createResearchArtifacts = internalMutation({
  args: {
    researchId: v.string(),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    query: v.string(),
    evidence: v.array(
      v.object({
        subQuestionId: v.string(),
        sourceType: v.string(),
        sourceTitle: v.string(),
        sourceUrl: v.optional(v.string()),
        content: v.string(),
        relevanceScore: v.optional(v.number()),
        metadata: v.optional(v.any()),
      })
    ),
    finalResponse: v.string(),
    subQuestions: v.array(
      v.object({
        id: v.string(),
        question: v.string(),
      })
    ),
    /** Normalized base title; table/report titles are derived (see literature review). */
    researchTitle: v.optional(v.string()),
  },
  returns: v.object({
    tableId: v.id("literatureTables"),
    reportId: v.id("literatureReports"),
  }),
  handler: async (ctx, args) => {
    await assertCanEditNotebook(ctx, args.notebookId, args.userId);

    const now = Date.now();

    // 1. Group evidence by source (before deduplicating) so we can map
    //    all sub-question evidence to each source for custom columns.
    const evidenceBySource = new Map<string, (typeof args.evidence)[0][]>();
    for (const entry of args.evidence) {
      const key = entry.sourceUrl || entry.sourceTitle;
      if (!evidenceBySource.has(key)) {
        evidenceBySource.set(key, []);
      }
      evidenceBySource.get(key)!.push(entry);
    }

    // 2. Create citations for each unique source
    const citationEntries: Array<{
      evidenceKey: string;
      citationId: Id<"citations">;
      citationKey: string;
    }> = [];
    const existingKeys = new Set<string>();

    for (const [key, entries] of evidenceBySource) {
      const entry = entries[0]; // representative entry
      const citation = buildCitationFromEvidence(entry);

      const citationKey = generateCitationKey(citation, existingKeys);
      existingKeys.add(citationKey);

      const citationId = await ctx.db.insert("citations", {
        paperId: String(citation.paperId),
        title: entry.sourceTitle,
        authors: citation.authors,
        year: citation.year,
        doi: citation.doi,
        url: citation.url,
        pdfUrl: entry.metadata?.pdfUrl,
        sourceApi: citation.sourceApi,
        citationCount: entry.metadata?.citationCount,
        abstract: entry.content.slice(0, 2000),
        citationKey,
      });

      citationEntries.push({ evidenceKey: key, citationId, citationKey });
    }

    // 3. Build custom columns from sub-questions (3-4 themes)
    const customColumns = args.subQuestions.slice(0, 4).map((sq, idx) => ({
      id: `col_${sq.id}`,
      name: sq.question.slice(0, 60),
      type: "custom" as const,
      instructions: `Extract information relevant to: ${sq.question}`,
      isVisible: true,
      isSystem: false,
      order: idx + 3,
    }));

    // 4. Create literature table
    const columns = [
      {
        id: "paper_title",
        name: "Paper Title",
        type: "paper_title" as const,
        isVisible: true,
        isSystem: true,
        order: 0,
      },
      {
        id: "authors",
        name: "Authors",
        type: "authors" as const,
        isVisible: true,
        isSystem: true,
        order: 1,
      },
      {
        id: "year",
        name: "Year",
        type: "year" as const,
        isVisible: true,
        isSystem: true,
        order: 2,
      },
      ...customColumns,
    ];

    const papers: Array<{
      citationId: Id<"citations">;
      rowData: Record<string, string>;
      includeReason?: string;
      isIncluded: boolean;
    }> = [];

    for (const { evidenceKey, citationId } of citationEntries) {
      const entries = evidenceBySource.get(evidenceKey)!;
      const representativeEntry = entries[0];
      const rowData: Record<string, string> = {
        paper_title: representativeEntry.sourceTitle,
        authors: (representativeEntry.metadata?.authors || []).join(", "),
        year: representativeEntry.metadata?.year ? String(representativeEntry.metadata.year) : "",
      };

      // Add custom column data from ALL evidence entries for this source
      for (const col of customColumns) {
        const sq = args.subQuestions.find((s) => `col_${s.id}` === col.id);
        if (sq) {
          const matchingEntries = entries.filter((e) => e.subQuestionId === sq.id);
          if (matchingEntries.length > 0) {
            rowData[col.id] = matchingEntries.map((e) => e.content.slice(0, 500)).join("\n\n");
          } else {
            rowData[col.id] = "";
          }
        }
      }

      papers.push({
        citationId,
        rowData,
        includeReason: `Source for research: ${args.query}`,
        isIncluded: true,
      });
    }

    const baseTitle = args.researchTitle?.trim() || fallbackResearchTitleFromQuery(args.query);
    const tableTitle = deepResearchTableTitle(baseTitle);
    const reportTitle = deepResearchReportTitle(baseTitle);

    const tableId = await ctx.db.insert("literatureTables", {
      title: tableTitle,
      description: `Auto-generated evidence table from deep research: ${args.query.slice(0, 100)}`,
      notebookId: args.notebookId,
      userId: args.userId,
      status: "completed",
      columns,
      papers,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Create literature report with sections
    const citationMap = new Map(citationEntries.map((c) => [c.evidenceKey, c.citationKey]));

    // Build citation objects for the engine
    const citations = citationEntries.map(({ evidenceKey }) => {
      const entries = evidenceBySource.get(evidenceKey)!;
      const entry = entries[0];
      return buildCitationFromEvidence(entry);
    });

    const engine = createCitationEngine();
    const orderedEvidence = buildOrderedEvidence(args.evidence, args.subQuestions);

    const formatInlineForSource = (sourceKey: string): string | undefined => {
      const citationKey = citationMap.get(sourceKey);
      if (!citationKey) return undefined;
      const citationIndex = citationEntries.findIndex((c) => c.evidenceKey === sourceKey);
      const citation = citations[citationIndex];
      if (!citation) return undefined;
      return engine.formatInline(citation, "apa7");
    };

    const citedResponse = applyNumericCitations(
      args.finalResponse,
      orderedEvidence,
      formatInlineForSource
    );

    let sections: ReportSection[] = parseMarkdownSections(citedResponse);
    if (sections.length === 0) {
      sections = buildFallbackSections(
        args.query,
        citedResponse,
        evidenceBySource.size,
        args.subQuestions.length
      );
    } else {
      sections = sections.map((section) => ({
        ...section,
        content: applyNumericCitations(section.content, orderedEvidence, formatInlineForSource),
      }));
      sections = sortReportSections(sections);
      const methodsIdx = sections.findIndex((s) => s.heading.toLowerCase() === "methods");
      const methodsBlurb = buildMethodsSection(evidenceBySource.size, args.subQuestions.length);
      if (methodsIdx >= 0) {
        sections[methodsIdx] = {
          heading: "Methods",
          content: `${methodsBlurb}\n\n${sections[methodsIdx].content}`,
        };
      } else {
        sections.push({ heading: "Methods", content: methodsBlurb });
        sections = sortReportSections(sections);
      }
    }

    const fullContent = sections.map((s) => `## ${s.heading}\n\n${s.content}`).join("\n\n");

    const reportId = await ctx.db.insert("literatureReports", {
      title: reportTitle,
      notebookId: args.notebookId,
      userId: args.userId,
      status: "completed",
      content: fullContent,
      citationStyle: "apa7",
      sections,
      citationIds: citationEntries.map((c) => c.citationId),
      tableId,
      createdAt: now,
      updatedAt: now,
    });

    return { tableId, reportId };
  },
});
