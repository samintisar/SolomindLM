/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

async function seedNotebookAndUser(
  t: ReturnType<typeof convexTest>
): Promise<{ userId: Id<"users">; notebookId: Id<"notebooks"> }> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Test User" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Test Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { userId, notebookId };
  });
}

describe("createResearchArtifacts", () => {
  test("creates citations correctly", async () => {
    const t = convexTest(schema, modules);
    const { userId, notebookId } = await seedNotebookAndUser(t);

    await t.mutation(api.research.index.createResearchArtifacts, {
      researchId: "research_123",
      notebookId,
      userId,
      query: "Test research query",
      evidence: [
        {
          subQuestionId: "sq1",
          sourceType: "academic",
          sourceTitle: "Paper One",
          sourceUrl: "https://example.com/paper1",
          content: "Content for paper one",
          relevanceScore: 0.9,
          metadata: {
            authors: ["John Smith"],
            year: 2023,
            doi: "10.1234/paper1",
          },
        },
        {
          subQuestionId: "sq2",
          sourceType: "academic",
          sourceTitle: "Paper Two",
          sourceUrl: "https://example.com/paper2",
          content: "Content for paper two",
          relevanceScore: 0.85,
          metadata: {
            authors: ["Alice Johnson"],
            year: 2024,
            doi: "10.5678/example2",
          },
        },
      ],
      finalResponse: "This is the final response.",
      subQuestions: [
        { id: "sq1", question: "What is question one?" },
        { id: "sq2", question: "What is question two?" },
      ],
    });

    // Verify citations were created
    const citation1 = await t.run(async (ctx) => {
      return await ctx.db
        .query("citations")
        .withIndex("by_paperId", (q) => q.eq("paperId", "10.1234/paper1"))
        .first();
    });
    expect(citation1).not.toBeNull();
    expect(citation1!.title).toBe("Paper One");
    expect(citation1!.citationKey).toBe("Smith2023");

    const citation2 = await t.run(async (ctx) => {
      return await ctx.db
        .query("citations")
        .withIndex("by_paperId", (q) => q.eq("paperId", "10.5678/example2"))
        .first();
    });
    expect(citation2).not.toBeNull();
    expect(citation2!.title).toBe("Paper Two");
    expect(citation2!.citationKey).toBe("Johnson2024");
  });

  test("creates table with correct columns and rows", async () => {
    const t = convexTest(schema, modules);
    const { userId, notebookId } = await seedNotebookAndUser(t);

    const result = await t.mutation(api.research.index.createResearchArtifacts, {
      researchId: "research_456",
      notebookId,
      userId,
      query: "Another research query",
      evidence: [
        {
          subQuestionId: "sq1",
          sourceType: "academic",
          sourceTitle: "Test Paper",
          sourceUrl: "https://example.com/test",
          content: "Relevant content for sq1",
          relevanceScore: 0.9,
          metadata: {
            authors: ["Author, A."],
            year: 2022,
          },
        },
      ],
      finalResponse: "Response text.",
      subQuestions: [{ id: "sq1", question: "What is the main finding?" }],
    });

    const table = await t.run(async (ctx) => {
      return await ctx.db.get(result.tableId);
    });

    expect(table).not.toBeNull();
    expect(table!.title).toBe("Another research query");
    expect(table!.columns.length).toBe(4); // paper_title, authors, year, custom

    const customCol = table!.columns.find((c) => c.id === "col_sq1");
    expect(customCol).toBeDefined();
    expect(customCol!.name).toBe("What is the main finding?");

    expect(table!.papers.length).toBe(1);
    expect(table!.papers[0]!.rowData["paper_title"]).toBe("Test Paper");
    expect(table!.papers[0]!.rowData["col_sq1"]).toBe("Relevant content for sq1");
  });

  test("creates report with content and sections", async () => {
    const t = convexTest(schema, modules);
    const { userId, notebookId } = await seedNotebookAndUser(t);

    const result = await t.mutation(api.research.index.createResearchArtifacts, {
      researchId: "research_789",
      notebookId,
      userId,
      query: "Research on AI",
      evidence: [
        {
          subQuestionId: "sq1",
          sourceType: "academic",
          sourceTitle: "AI Paper",
          sourceUrl: "https://example.com/ai",
          content: "AI content",
          relevanceScore: 0.95,
          metadata: {
            authors: ["Researcher, R."],
            year: 2025,
          },
        },
      ],
      finalResponse: "AI is transforming many fields.",
      subQuestions: [{ id: "sq1", question: "How is AI used?" }],
    });

    const report = await t.run(async (ctx) => {
      return await ctx.db.get(result.reportId);
    });

    expect(report).not.toBeNull();
    expect(report!.title).toBe("Research on AI");
    expect(report!.citationStyle).toBe("apa7");
    expect(report!.sections.length).toBeGreaterThan(0);
    expect(report!.content).toContain("## Abstract");
    expect(report!.content).toContain("## Conclusion");
    expect(report!.content).not.toContain("## References");
    expect(report!.sections.some((s) => s.heading === "References")).toBe(false);
    expect(report!.citationIds.length).toBe(1);
  });

  test("parses writer markdown sections and omits embedded references", async () => {
    const t = convexTest(schema, modules);
    const { userId, notebookId } = await seedNotebookAndUser(t);

    const result = await t.mutation(api.research.index.createResearchArtifacts, {
      researchId: "research_structured",
      notebookId,
      userId,
      query: "Benchmark reliability",
      evidence: [
        {
          subQuestionId: "sq1",
          sourceType: "academic",
          sourceTitle: "Benchmark Paper",
          sourceUrl: "https://example.com/bench",
          content: "Benchmarks often mis-rank models.",
          relevanceScore: 0.9,
        },
      ],
      finalResponse: `## Abstract

Benchmarks are imperfect proxies [1].

## Discussion

Construct validity matters [1].

## References

Should not appear in stored sections.`,
      subQuestions: [{ id: "sq1", question: "How reliable are benchmarks?" }],
    });

    const report = await t.run(async (ctx) => ctx.db.get(result.reportId));

    expect(report!.sections.map((s) => s.heading)).toEqual(["Abstract", "Methods", "Discussion"]);
    expect(report!.content).not.toContain("Should not appear");
  });

  test("deduplicates sources", async () => {
    const t = convexTest(schema, modules);
    const { userId, notebookId } = await seedNotebookAndUser(t);

    const result = await t.mutation(api.research.index.createResearchArtifacts, {
      researchId: "research_dedup",
      notebookId,
      userId,
      query: "Deduplication test",
      evidence: [
        {
          subQuestionId: "sq1",
          sourceType: "academic",
          sourceTitle: "Same Paper",
          sourceUrl: "https://example.com/same",
          content: "Content from sq1",
          relevanceScore: 0.9,
          metadata: {
            authors: ["Author, A."],
            year: 2023,
          },
        },
        {
          subQuestionId: "sq2",
          sourceType: "academic",
          sourceTitle: "Same Paper",
          sourceUrl: "https://example.com/same",
          content: "Content from sq2",
          relevanceScore: 0.85,
          metadata: {
            authors: ["Author, A."],
            year: 2023,
          },
        },
        {
          subQuestionId: "sq1",
          sourceType: "academic",
          sourceTitle: "Different Paper",
          sourceUrl: "https://example.com/different",
          content: "Different content",
          relevanceScore: 0.8,
          metadata: {
            authors: ["Other, B."],
            year: 2022,
          },
        },
      ],
      finalResponse: "Testing deduplication.",
      subQuestions: [
        { id: "sq1", question: "Question one?" },
        { id: "sq2", question: "Question two?" },
      ],
    });

    const table = await t.run(async (ctx) => {
      return await ctx.db.get(result.tableId);
    });

    // Should have 2 papers (Same Paper deduplicated, Different Paper)
    expect(table!.papers.length).toBe(2);

    // The deduplicated paper should have content from both sub-questions
    const samePaperRow = table!.papers.find((p) => p.rowData["paper_title"] === "Same Paper");
    expect(samePaperRow).toBeDefined();
    expect(samePaperRow!.rowData["col_sq1"]).toBe("Content from sq1");
    expect(samePaperRow!.rowData["col_sq2"]).toBe("Content from sq2");

    // Report should reference 2 unique citations
    const report = await t.run(async (ctx) => {
      return await ctx.db.get(result.reportId);
    });
    expect(report!.citationIds.length).toBe(2);
  });

  test("handles sources with no authors or year", async () => {
    const t = convexTest(schema, modules);
    const { userId, notebookId } = await seedNotebookAndUser(t);

    const result = await t.mutation(api.research.index.createResearchArtifacts, {
      researchId: "research_no_meta",
      notebookId,
      userId,
      query: "No metadata test",
      evidence: [
        {
          subQuestionId: "sq1",
          sourceType: "web",
          sourceTitle: "Web Article",
          sourceUrl: "https://example.com/article",
          content: "Web content",
          relevanceScore: 0.7,
        },
      ],
      finalResponse: "No metadata response.",
      subQuestions: [{ id: "sq1", question: "Web question?" }],
    });

    const table = await t.run(async (ctx) => {
      return await ctx.db.get(result.tableId);
    });

    expect(table!.papers.length).toBe(1);
    expect(table!.papers[0]!.rowData["authors"]).toBe("");
    expect(table!.papers[0]!.rowData["year"]).toBe("");
  });
});
