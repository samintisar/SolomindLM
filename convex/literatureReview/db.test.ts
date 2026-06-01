import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  RANKED_PAPER_SNAPSHOT_ABSTRACT_MAX_CHARS,
  RANKED_PAPERS_SNAPSHOT_MAX_COUNT,
} from "./rankedPapersSnapshot";

// Manual module imports to avoid import.meta.glob (not available in bun test runtime)
const modules = {
  "./literatureReview/db.ts": () => import("./db.js"),
  "./studio/literature_tables/index.ts": () => import("../studio/literature_tables/index.js"),
  "./_generated/server.js": () => import("../_generated/server.js"),
  "./_generated/api.js": () => import("../_generated/api.js"),
};

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test User" }));
}

async function seedNotebook(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">
): Promise<Id<"notebooks">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title: "Test Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function seedSession(
  t: ReturnType<typeof convexTest>,
  notebookId: Id<"notebooks">,
  userId: Id<"users">,
  options?: { reviewTitle?: string; query?: string }
): Promise<Id<"literatureReviewSessions">> {
  return t.run(async (ctx) =>
    ctx.db.insert("literatureReviewSessions", {
      query: options?.query ?? "Test literature review query",
      reviewTitle: options?.reviewTitle ?? "Digital Interventions for Depression",
      notebookId,
      userId,
      workflowId: "wf_test123",
      status: "planning",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

describe("insertDraftBatch", () => {
  test("inserts drafts for included papers", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    const papers = [
      {
        title: "Paper One",
        authors: ["Smith, J."],
        year: 2023,
        abstract: "Abstract one",
        url: "http://example.com/1",
        source: "arxiv" as const,
        score: 0.9,
        isIncluded: true,
        includeReason: "Relevant",
      },
      {
        title: "Paper Two",
        authors: ["Jones, A."],
        year: 2024,
        abstract: "Abstract two",
        url: "http://example.com/2",
        source: "semantic_scholar" as const,
        score: 0.8,
        isIncluded: false,
        includeReason: "Not relevant",
      },
    ];

    await t.mutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId,
      papers,
      columns: [
        { id: "title", name: "Title", isVisible: true },
        { id: "authors", name: "Authors", isVisible: true },
        { id: "year", name: "Year", isVisible: true },
        { id: "abstract", name: "Abstract", isVisible: true },
      ],
      batchNumber: 0,
    });

    // Only the included paper should create a draft
    const drafts = await t.run(async (ctx) =>
      ctx.db
        .query("literatureTableDrafts")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .collect()
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0].rowData["title"]).toBe("Paper One");
    expect(drafts[0].isIncluded).toBe(true);
    expect(drafts[0].batchNumber).toBe(0);
  });

  test("creates citations for drafts", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    const papers = [
      {
        title: "Paper One",
        authors: ["Smith, J."],
        year: 2023,
        abstract: "Abstract one",
        url: "http://example.com/1",
        source: "arxiv" as const,
        score: 0.9,
        isIncluded: true,
      },
    ];

    await t.mutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId,
      papers,
      columns: [{ id: "title", name: "Title", isVisible: true }],
      batchNumber: 0,
    });

    const drafts = await t.run(async (ctx) =>
      ctx.db
        .query("literatureTableDrafts")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .collect()
    );

    const citation = await t.run(async (ctx) => ctx.db.get(drafts[0].citationId));

    expect(citation).not.toBeNull();
    expect(citation!.title).toBe("Paper One");
    expect(citation!.authors).toEqual(["Smith, J."]);
  });
});

describe("persistTable", () => {
  test("persists table from drafts and links to session", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    // Insert some drafts first
    await t.mutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId,
      papers: [
        {
          title: "Paper One",
          authors: ["Smith, J."],
          year: 2023,
          abstract: "Abstract one",
          url: "http://example.com/1",
          source: "arxiv" as const,
          score: 0.9,
          isIncluded: true,
        },
      ],
      columns: [{ id: "title", name: "Title", isVisible: true }],
      batchNumber: 0,
    });

    const result = await t.mutation(internal.literatureReview.db.persistTable, {
      sessionId,
      columns: [
        { id: "title", name: "Title", isVisible: true },
        { id: "authors", name: "Authors", isVisible: true },
      ],
    });

    const table = await t.run(async (ctx) => ctx.db.get(result.tableId));
    expect(table).not.toBeNull();
    expect(table!.title).toBe("Digital Interventions for Depression: Evidence Table");
    expect(table!.papers).toHaveLength(1);
    expect(table!.columns).toHaveLength(2);

    // Check session was updated
    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.tableId).toBe(result.tableId);
  });

  test("throws when session not found", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    // Create a valid session ID that doesn't exist in the database
    const fakeSessionId = await t.run(async (ctx) =>
      ctx.db.insert("literatureReviewSessions", {
        query: "Test",
        notebookId,
        userId,
        workflowId: "wf_test",
        status: "planning",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    // Delete it to make it nonexistent
    await t.run(async (ctx) => ctx.db.delete(fakeSessionId));

    await expect(
      t.mutation(internal.literatureReview.db.persistTable, {
        sessionId: fakeSessionId,
        columns: [],
      })
    ).rejects.toThrow("Literature review session not found");
  });
});

describe("persistReport", () => {
  test("persists report with content and sections", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    // Create a table first
    const tableResult = await t.mutation(internal.literatureReview.db.persistTable, {
      sessionId,
      columns: [{ id: "title", name: "Title", isVisible: true }],
    });

    const result = await t.mutation(internal.literatureReview.db.persistReport, {
      sessionId,
      tableId: tableResult.tableId,
      query: "Test query",
      content: "## Abstract\n\nTest content",
      sections: [{ heading: "Abstract", content: "Test content" }],
      citationIds: [],
    });

    const report = await t.run(async (ctx) => ctx.db.get(result.reportId));
    expect(report).not.toBeNull();
    expect(report!.title).toBe("Digital Interventions for Depression");
    expect(report!.content).toBe("## Abstract\n\nTest content");
    expect(report!.sections).toHaveLength(1);
    expect(report!.citationStyle).toBe("apa");

    // Check session was updated
    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.reportId).toBe(result.reportId);
  });

  test("uses default content when not provided", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    const tableResult = await t.mutation(internal.literatureReview.db.persistTable, {
      sessionId,
      columns: [],
    });

    const result = await t.mutation(internal.literatureReview.db.persistReport, {
      sessionId,
      tableId: tableResult.tableId,
      query: "Test query",
    });

    const report = await t.run(async (ctx) => ctx.db.get(result.reportId));
    expect(report).not.toBeNull();
    expect(report!.content).toContain("Literature review");
    expect(report!.sections).toHaveLength(1);
  });
});

describe("getCitationsByIds", () => {
  test("returns citations by IDs", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    await t.mutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId,
      papers: [
        {
          title: "Paper One",
          authors: ["Smith, J."],
          year: 2023,
          abstract: "Abstract one",
          url: "http://example.com/1",
          source: "arxiv" as const,
          score: 0.9,
          isIncluded: true,
        },
      ],
      columns: [{ id: "title", name: "Title", isVisible: true }],
      batchNumber: 0,
    });

    const drafts = await t.run(async (ctx) =>
      ctx.db
        .query("literatureTableDrafts")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .collect()
    );

    const citationId = drafts[0].citationId;

    const citations = await t.query(internal.literatureReview.db.getCitationsByIds, {
      citationIds: [citationId],
    });

    expect(citations).toHaveLength(1);
    expect(citations[0].title).toBe("Paper One");
    expect(citations[0]._id).toBe(citationId);
  });

  test("handles missing citations gracefully", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    // Insert a draft with a citation
    await t.mutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId,
      papers: [
        {
          title: "Paper One",
          authors: ["Smith, J."],
          year: 2023,
          abstract: "Abstract one",
          url: "http://example.com/1",
          source: "arxiv" as const,
          score: 0.9,
          isIncluded: true,
        },
      ],
      columns: [{ id: "title", name: "Title", isVisible: true }],
      batchNumber: 0,
    });

    const drafts = await t.run(async (ctx) =>
      ctx.db
        .query("literatureTableDrafts")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .collect()
    );

    const citationId = drafts[0].citationId;

    // Delete the citation
    await t.run(async (ctx) => ctx.db.delete(citationId));

    const citations = await t.query(internal.literatureReview.db.getCitationsByIds, {
      citationIds: [citationId],
    });

    expect(citations).toEqual([]);
  });
});

describe("getDraftsBySession", () => {
  test("returns drafts for session", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    await t.mutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId,
      papers: [
        {
          title: "Paper One",
          authors: ["Smith, J."],
          year: 2023,
          abstract: "Abstract one",
          url: "http://example.com/1",
          source: "arxiv" as const,
          score: 0.9,
          isIncluded: true,
        },
      ],
      columns: [{ id: "title", name: "Title", isVisible: true }],
      batchNumber: 0,
    });

    const drafts = await t.query(internal.literatureReview.db.getDraftsBySession, {
      sessionId,
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].rowData["title"]).toBe("Paper One");
    expect(drafts[0].batchNumber).toBe(0);
  });

  test("returns empty array when no drafts exist", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    const drafts = await t.query(internal.literatureReview.db.getDraftsBySession, {
      sessionId,
    });

    expect(drafts).toEqual([]);
  });
});

describe("getExistingBatchNumbers", () => {
  test("returns unique batch numbers", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    await t.mutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId,
      papers: [
        {
          title: "Paper One",
          authors: ["Smith, J."],
          year: 2023,
          abstract: "Abstract one",
          url: "http://example.com/1",
          source: "arxiv" as const,
          score: 0.9,
          isIncluded: true,
        },
      ],
      columns: [{ id: "title", name: "Title", isVisible: true }],
      batchNumber: 0,
    });

    await t.mutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId,
      papers: [
        {
          title: "Paper Two",
          authors: ["Jones, A."],
          year: 2024,
          abstract: "Abstract two",
          url: "http://example.com/2",
          source: "arxiv" as const,
          score: 0.8,
          isIncluded: true,
        },
      ],
      columns: [{ id: "title", name: "Title", isVisible: true }],
      batchNumber: 1,
    });

    const batchNumbers = await t.query(internal.literatureReview.db.getExistingBatchNumbers, {
      sessionId,
    });

    expect(batchNumbers).toEqual([0, 1]);
  });
});

describe("insertDraftBatch with custom columns", () => {
  test("uses pre-computed rowData when provided on paper", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    const papers = [
      {
        title: "Paper One",
        authors: ["Smith, J."],
        year: 2023,
        abstract: "Abstract one",
        url: "http://example.com/1",
        source: "arxiv" as const,
        score: 0.9,
        isIncluded: true,
        extractedData: {
          study_design: "Randomized controlled trial",
          sample_size: "N = 245",
        },
      },
    ];

    await t.mutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId,
      papers,
      columns: [
        { id: "study_design", name: "Study Design", isVisible: true },
        { id: "sample_size", name: "Sample Size", isVisible: true },
      ],
      batchNumber: 0,
    });

    const drafts = await t.run(async (ctx) =>
      ctx.db
        .query("literatureTableDrafts")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .collect()
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0].rowData["study_design"]).toBe("Randomized controlled trial");
    expect(drafts[0].rowData["sample_size"]).toBe("N = 245");
  });

  test("falls back to basic metadata when rowData is not provided", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    const papers = [
      {
        title: "Paper One",
        authors: ["Smith, J."],
        year: 2023,
        abstract: "Abstract one",
        url: "http://example.com/1",
        source: "arxiv" as const,
        score: 0.9,
        isIncluded: true,
      },
    ];

    await t.mutation(internal.literatureReview.db.insertDraftBatch, {
      sessionId,
      papers,
      columns: [
        { id: "title", name: "Title", isVisible: true },
        { id: "authors", name: "Authors", isVisible: true },
        { id: "year", name: "Year", isVisible: true },
      ],
      batchNumber: 0,
    });

    const drafts = await t.run(async (ctx) =>
      ctx.db
        .query("literatureTableDrafts")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .collect()
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0].rowData["title"]).toBe("Paper One");
    expect(drafts[0].rowData["authors"]).toBe("Smith, J.");
    expect(drafts[0].rowData["year"]).toBe("2023");
  });
});

describe("getTableById", () => {
  test("returns table by ID", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    const result = await t.mutation(internal.literatureReview.db.persistTable, {
      sessionId,
      columns: [{ id: "title", name: "Title", isVisible: true }],
    });

    // Test via direct DB access since the query has complex union validation
    const table = await t.run(async (ctx) => ctx.db.get(result.tableId));

    expect(table).not.toBeNull();
    expect(table!.title).toBe("Digital Interventions for Depression: Evidence Table");
    expect(table!.status).toBe("completed");
    expect(table!.columns).toHaveLength(1);
  });

  test("returns null for deleted table", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    const result = await t.mutation(internal.literatureReview.db.persistTable, {
      sessionId,
      columns: [],
    });

    // Delete the table
    await t.run(async (ctx) => ctx.db.delete(result.tableId));

    const table = await t.run(async (ctx) => ctx.db.get(result.tableId));
    expect(table).toBeNull();
  });
});

describe("persistRankedPapers", () => {
  test("stores top papers with trimmed abstracts", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    const longAbstract = "z".repeat(RANKED_PAPER_SNAPSHOT_ABSTRACT_MAX_CHARS + 500);
    const papers = Array.from({ length: RANKED_PAPERS_SNAPSHOT_MAX_COUNT + 10 }, (_, i) => ({
      title: `Paper ${i}`,
      authors: ["Author"],
      year: 2024,
      abstract: i === 0 ? longAbstract : `Abstract ${i}`,
      url: `https://example.com/${i}`,
      source: "arxiv" as const,
      score: 1 - i * 0.01,
    }));

    await t.mutation(internal.literatureReview.db.persistRankedPapers, {
      sessionId,
      papers,
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("literatureReviewRankedPapers")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .first()
    );

    expect(row?.papers).toHaveLength(RANKED_PAPERS_SNAPSHOT_MAX_COUNT);
    expect(row?.papers[0]?.title).toBe("Paper 0");
    expect(row?.papers[0]?.abstract.length).toBeLessThanOrEqual(
      RANKED_PAPER_SNAPSHOT_ABSTRACT_MAX_CHARS
    );
    expect(row?.papers[0]?.abstract.endsWith("…")).toBe(true);
  });
});

describe("updateLiteratureReviewSessionStatus", () => {
  test("updates status and saves suggestedColumns", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    const suggestedColumns = [
      {
        id: "study_design",
        name: "Study Design",
        instructions: "Extract study design",
        isVisible: true,
      },
      {
        id: "sample_size",
        name: "Sample Size",
        instructions: "Extract sample size",
        isVisible: true,
      },
    ];

    await t.mutation(internal.studio.literature_tables.index.updateLiteratureReviewSessionStatus, {
      sessionId,
      status: "awaiting_columns",
      suggestedColumns,
    });

    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.status).toBe("awaiting_columns");
    expect(session!.suggestedColumns).toEqual(suggestedColumns);
  });

  test("patchWorkflowProvenance merges optional fields", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    await t.mutation(internal.literatureReview.db.patchWorkflowProvenance, {
      sessionId,
      patch: {
        recordsIdentified: 100,
        recordsIncluded: 12,
        searchQueries: ["query a"],
      },
    });

    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.workflowProvenance?.recordsIdentified).toBe(100);
    expect(session!.workflowProvenance?.recordsIncluded).toBe(12);

    await t.mutation(internal.literatureReview.db.patchWorkflowProvenance, {
      sessionId,
      patch: { recordsExcluded: 18 },
    });

    const updated = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(updated!.workflowProvenance?.recordsIdentified).toBe(100);
    expect(updated!.workflowProvenance?.recordsExcluded).toBe(18);
  });

  test("replaceScreeningDecisions stores included and excluded", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    await t.mutation(internal.literatureReview.db.replaceScreeningDecisions, {
      sessionId,
      decisions: [
        {
          paperIndex: 0,
          title: "Included paper",
          authors: ["A. Author"],
          year: 2024,
          decision: "included",
          reason: "Relevant",
          rank: 1,
        },
        {
          paperIndex: 1,
          title: "Excluded paper",
          authors: ["B. Author"],
          decision: "excluded",
          reason: "Off topic",
          rank: 2,
        },
      ],
    });

    const rows = await t.query(internal.literatureReview.db.getScreeningDecisionsBySession, {
      sessionId,
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.decision === "excluded")).toHaveLength(1);
  });

  test("updates status without suggestedColumns", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const sessionId = await seedSession(t, notebookId, userId);

    await t.mutation(internal.studio.literature_tables.index.updateLiteratureReviewSessionStatus, {
      sessionId,
      status: "completed",
    });

    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.status).toBe("completed");
  });
});
