/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  getChatLinkedLiteratureArtifactIds,
  isChatLiteratureReport,
  isChatLiteratureTable,
} from "../_model/literatureArtifacts";
import { preloadModules } from "../_testing/preloadModules.helpers";
import { YOUTUBE_INGESTION_STAGGER_MS } from "../documents/ingestionDelay.helpers";
import schema from "../schema";
import { SHOWCASE_FOLDER_NAME, SHOWCASE_NOTEBOOKS } from "./manifest";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./showcase/db.ts"]);

const OWNER = "maintainer@example.com";
const bySlug = (slug: string) => {
  const notebook = SHOWCASE_NOTEBOOKS.find((n) => n.slug === slug);
  if (!notebook) throw new Error(`missing ${slug}`);
  return notebook;
};
const GUIDE = bySlug("getting-started-with-solomindlm");
const ECON = bySlug("econ-101-midterm-prep");
const TEN_K = bySlug("reading-a-10-k");
const REVIEW = bySlug("spaced-repetition-literature-review");
const ref = (slug: string) => ({ ownerEmail: OWNER, slug });

// Keep scheduled jobs (docEmbedding, Studio generation) from running: they call external services.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type T = ReturnType<typeof convexTest>;

async function setup() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) =>
    ctx.db.insert("users", { email: OWNER, name: "Maintainer" })
  );
  return { t, ownerId };
}

async function markSourcesRead(t: T, notebookId: Id<"notebooks">) {
  await t.run(async (ctx) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
      .collect();
    for (const d of docs) await ctx.db.patch("documents", d._id, { status: "completed" });
  });
}

async function status(t: T, slug: string) {
  const [row] = await t.query(internal.showcase.db.seedStatus, { ownerEmail: OWNER, slug });
  return row;
}

describe("showcase db", () => {
  test("refuses an owner email with no account", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(internal.showcase.db.ensureNotebook, {
        ownerEmail: "nobody@example.com",
        slug: GUIDE.slug,
      })
    ).rejects.toThrow("No user with email nobody@example.com");
  });

  test("creates the notebook once, in the Showcase folder, with the manifest's chat mode", async () => {
    const { t, ownerId } = await setup();
    const first = await t.mutation(internal.showcase.db.ensureNotebook, ref(ECON.slug));
    const second = await t.mutation(internal.showcase.db.ensureNotebook, ref(ECON.slug));
    expect(second).toBe(first);
    const { notebook, folders } = await t.run(async (ctx) => ({
      notebook: await ctx.db.get("notebooks", first),
      folders: await ctx.db
        .query("folders")
        .withIndex("by_user", (q) => q.eq("userId", ownerId))
        .collect(),
    }));
    expect(notebook).toMatchObject({ title: ECON.title, userId: ownerId, icon: ECON.icon });
    expect(notebook?.chatSettings?.instructionMode).toBe("learningGuide");
    expect(folders.map((f) => f.name)).toEqual([SHOWCASE_FOLDER_NAME]);
  });

  test("adds a source once and schedules its ingestion", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(GUIDE.slug));
    const first = await t.mutation(internal.showcase.db.addSource, {
      ...ref(GUIDE.slug),
      sourceIndex: 0,
    });
    const again = await t.mutation(internal.showcase.db.addSource, {
      ...ref(GUIDE.slug),
      sourceIndex: 0,
    });
    expect(first).not.toBeNull();
    expect(again).toBeNull();
    const { docs, scheduled } = await t.run(async (ctx) => ({
      docs: await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(docs).toHaveLength(1);
    const guideSource = GUIDE.sources[0];
    expect(docs[0]).toMatchObject({
      fileType: "text",
      fileName: guideSource.kind === "text" ? guideSource.title : "",
      status: "pending",
    });
    expect(scheduled.filter((s) => s.name.includes("embeddingJob"))).toHaveLength(1);
  });

  test("staggers YouTube ingestion like documents.upload; other sources start at once", async () => {
    const { t } = await setup();
    await t.mutation(internal.showcase.db.ensureNotebook, ref(ECON.slug));
    const youtubeIndex = ECON.sources.findIndex((s) => s.kind === "youtube");
    const urlIndex = ECON.sources.findIndex((s) => s.kind === "url");
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      await t.mutation(internal.showcase.db.addSource, {
        ...ref(ECON.slug),
        sourceIndex: youtubeIndex,
      });
      await t.mutation(internal.showcase.db.addSource, {
        ...ref(ECON.slug),
        sourceIndex: urlIndex,
      });
    } finally {
      random.mockRestore();
    }
    const now = Date.now();
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const delays = scheduled
      .filter((s) => s.name.includes("embeddingJob"))
      .map((s) => s.scheduledTime - now);
    expect(delays).toEqual([YOUTUBE_INGESTION_STAGGER_MS / 2, 0]);
  });

  test("seedStatus walks the plan: sources first, then Studio items", async () => {
    const { t } = await setup();
    expect((await status(t, GUIDE.slug)).nextSteps).toEqual(["createNotebook"]);
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(GUIDE.slug));
    expect((await status(t, GUIDE.slug)).nextSteps).toEqual(["addSource"]);
    await t.mutation(internal.showcase.db.addSource, { ...ref(GUIDE.slug), sourceIndex: 0 });
    expect((await status(t, GUIDE.slug)).waitingOn).toEqual(["1 source(s) ingesting"]);
    await markSourcesRead(t, notebookId);
    expect((await status(t, GUIDE.slug)).nextSteps).toEqual(["startStudioItem", "startStudioItem"]);
  });

  test("starts each Studio item once and never restarts a failed one", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(GUIDE.slug));
    await t.mutation(internal.showcase.db.addSource, { ...ref(GUIDE.slug), sourceIndex: 0 });
    await markSourcesRead(t, notebookId);

    const reportId = await t.mutation(internal.showcase.db.startStudioItem, {
      ...ref(GUIDE.slug),
      itemIndex: 0,
    });
    expect(reportId).not.toBeNull();
    expect(
      await t.mutation(internal.showcase.db.startStudioItem, { ...ref(GUIDE.slug), itemIndex: 0 })
    ).toBeNull();

    await t.run((ctx) => ctx.db.patch("reports", reportId as Id<"reports">, { status: "failed" }));
    expect(
      await t.mutation(internal.showcase.db.startStudioItem, { ...ref(GUIDE.slug), itemIndex: 0 })
    ).toBeNull();
    const reports = await t.run((ctx) =>
      ctx.db
        .query("reports")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .collect()
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reportType: "study_guide" });
    expect((await status(t, GUIDE.slug)).problems).toEqual([
      'report "Report" failed. Delete it in the app, then re-run the seed.',
    ]);
  });

  test("adds discovered papers up to the manifest count, with the open-licence policy", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(REVIEW.slug));
    const take = REVIEW.paperDiscovery?.take ?? 0;
    const papers = Array.from({ length: take + 1 }, (_, i) => ({
      title: `Paper ${i}`,
      paperRecord: {
        abstract: "An abstract.",
        authors: ["A. Author"],
        doi: `10.1/p${i}`,
        isOa: true,
      },
    }));
    const added = await t.mutation(internal.showcase.db.addDiscoveredPapers, {
      ...ref(REVIEW.slug),
      papers: [papers[0], ...papers],
    });
    expect(added).toBe(take);
    const docs = await t.run((ctx) =>
      ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .collect()
    );
    expect(docs).toHaveLength(take);
    for (const doc of docs) {
      expect(doc).toMatchObject({
        fileType: "paper_record",
        fullTextPolicy: "open_license_only",
        status: "pending",
      });
    }
  });
});

/** A finished chat literature review (session, table, report) in the notebook. */
async function insertCompletedReview(
  t: T,
  notebookId: Id<"notebooks">,
  userId: Id<"users">,
  titles = { table: "Spaced Repetition: Evidence Table", report: "Spaced Repetition" }
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const sessionId = await ctx.db.insert("literatureReviewSessions", {
      query: "q",
      notebookId,
      userId,
      workflowId: "wf_1",
      status: "completed",
      createdAt: now,
      updatedAt: now,
    });
    const tableId = await ctx.db.insert("literatureTables", {
      title: titles.table,
      notebookId,
      userId,
      status: "completed",
      columns: [],
      papers: [],
      literatureReviewSessionId: sessionId,
      createdAt: now,
      updatedAt: now,
    });
    const reportId = await ctx.db.insert("literatureReports", {
      title: titles.report,
      notebookId,
      userId,
      status: "completed",
      content: "## Summary\n\nText",
      citationStyle: "apa",
      sections: [{ heading: "Summary", content: "Text" }],
      citationIds: [],
      tableId,
      literatureReviewSessionId: sessionId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("literatureReviewSessions", sessionId, { tableId, reportId });
    return sessionId;
  });
}

/** The notebook's Studio-visible literature tables and reports (not chat outputs). */
async function studioLiterature(t: T, notebookId: Id<"notebooks">) {
  return await t.run(async (ctx) => {
    const chat = await getChatLinkedLiteratureArtifactIds(ctx, notebookId);
    const tables = await ctx.db
      .query("literatureTables")
      .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
      .collect();
    const reports = await ctx.db
      .query("literatureReports")
      .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
      .collect();
    return {
      tables: tables.filter((r) => !isChatLiteratureTable(r, chat.tableIds)),
      reports: reports.filter((r) => !isChatLiteratureReport(r, chat.reportIds)),
    };
  });
}

describe("showcase db: review outputs and publishing", () => {
  test("copies a finished literature review into Studio once", async () => {
    const { t, ownerId } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(REVIEW.slug));
    await insertCompletedReview(t, notebookId, ownerId);

    await t.mutation(internal.showcase.db.copyLiteratureReviewToStudio, ref(REVIEW.slug));
    await t.mutation(internal.showcase.db.copyLiteratureReviewToStudio, ref(REVIEW.slug));

    const { tables, reports } = await studioLiterature(t, notebookId);
    expect(tables).toHaveLength(1);
    expect(reports).toHaveLength(1);
    expect(tables[0].title).toBe("Spaced Repetition: Evidence Table");
    expect(reports[0].tableId).toBe(tables[0]._id);
    expect(reports[0].content).toBe("## Summary\n\nText");
  });

  test("gives copies titles Studio shows, so a chat-style title is copied only once", async () => {
    const { t, ownerId } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(REVIEW.slug));
    await insertCompletedReview(t, notebookId, ownerId, {
      table: "Literature table — Spacing effect",
      report: "Report - Spacing effect",
    });

    await t.mutation(internal.showcase.db.copyLiteratureReviewToStudio, ref(REVIEW.slug));
    await t.mutation(internal.showcase.db.copyLiteratureReviewToStudio, ref(REVIEW.slug));

    const { tables, reports } = await studioLiterature(t, notebookId);
    expect(tables.map((r) => r.title)).toEqual(["Spacing effect"]);
    expect(reports.map((r) => r.title)).toEqual(["Spacing effect"]);
    const all = await t.run((ctx) =>
      ctx.db
        .query("literatureTables")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .collect()
    );
    expect(all).toHaveLength(2);
  });

  test("falls back to a plain title when only the chat prefix is left", async () => {
    const { t, ownerId } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(REVIEW.slug));
    await insertCompletedReview(t, notebookId, ownerId, {
      table: "Literature table — ",
      report: "Report —",
    });
    await t.mutation(internal.showcase.db.copyLiteratureReviewToStudio, ref(REVIEW.slug));
    await t.mutation(internal.showcase.db.copyLiteratureReviewToStudio, ref(REVIEW.slug));
    const { tables, reports } = await studioLiterature(t, notebookId);
    expect(tables.map((r) => r.title)).toEqual(["Literature Review: Evidence Table"]);
    expect(reports.map((r) => r.title)).toEqual(["Literature Review"]);
  });

  test("publishes a finished notebook as public and featured, and refuses an unfinished one", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(TEN_K.slug));
    await expect(
      t.mutation(internal.showcase.db.publishShowcaseNotebook, ref(TEN_K.slug))
    ).rejects.toThrow("isn't finished");

    await t.mutation(internal.showcase.db.addSource, { ...ref(TEN_K.slug), sourceIndex: 0 });
    await markSourcesRead(t, notebookId);
    for (let itemIndex = 0; itemIndex < TEN_K.studio.length; itemIndex++) {
      await t.mutation(internal.showcase.db.startStudioItem, { ...ref(TEN_K.slug), itemIndex });
    }
    await t.run(async (ctx) => {
      for (const table of ["reports", "quizzes", "spreadsheets"] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
          .collect();
        for (const row of rows) await ctx.db.patch(row._id, { status: "completed" });
      }
    });

    await t.mutation(internal.showcase.db.publishShowcaseNotebook, ref(TEN_K.slug));
    const published = await t.run((ctx) => ctx.db.get("notebooks", notebookId));
    expect(published).toMatchObject({ isPublic: true, isFeatured: true });
    expect(published?.publishedAt).toBeTypeOf("number");

    await t.mutation(internal.showcase.db.unpublishShowcase, {
      ownerEmail: OWNER,
      slug: TEN_K.slug,
    });
    expect(await t.run((ctx) => ctx.db.get("notebooks", notebookId))).toMatchObject({
      isPublic: false,
      isFeatured: false,
    });
  });

  test("deletes a showcase notebook only when the title is confirmed", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(TEN_K.slug));
    await expect(
      t.mutation(internal.showcase.db.deleteShowcaseNotebook, {
        ...ref(TEN_K.slug),
        confirmTitle: "nope",
      })
    ).rejects.toThrow("confirmTitle");
    await t.mutation(internal.showcase.db.deleteShowcaseNotebook, {
      ...ref(TEN_K.slug),
      confirmTitle: TEN_K.title,
    });
    expect(await t.run((ctx) => ctx.db.get("notebooks", notebookId))).toBeNull();
  });
});

async function insertUser(t: T, email: string) {
  return await t.run((ctx) => ctx.db.insert("users", { email, name: email }));
}

/** A deep-research plan in its own conversation, as `startDeepResearchRun` leaves it. */
async function insertResearchPlan(
  t: T,
  notebookId: Id<"notebooks">,
  userId: Id<"users">,
  status: "draft" | "approved" = "draft"
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      userId,
      notebookId,
      createdAt: now,
      updatedAt: now,
    });
    const messageId = await ctx.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "Planning…",
      createdAt: now,
    });
    return await ctx.db.insert("researchPlans", {
      userId,
      notebookId,
      conversationId,
      messageId,
      query: "q",
      subQuestions: [],
      sourcePolicy: { channels: ["notebook"] },
      status,
      workflowId: "wf_plan",
      createdAt: now,
      updatedAt: now,
    });
  });
}

/** Marks a workflow as paused in `awaitEvent`, as its "awaiting_user_input" step records. */
async function markAwaitingUserInput(t: T, researchId: string) {
  await t.run((ctx) =>
    ctx.db.insert("researchSteps", {
      researchId,
      agentType: "research",
      stepType: "awaiting_user_input",
      status: "in_progress",
      order: 1,
    })
  );
}

/** A literature review session paused for column confirmation (workflow step open). */
async function insertWaitingReview(t: T, notebookId: Id<"notebooks">, userId: Id<"users">) {
  const sessionId = await t.run((ctx) => {
    const now = Date.now();
    return ctx.db.insert("literatureReviewSessions", {
      query: "q",
      notebookId,
      userId,
      workflowId: "wf_review",
      status: "awaiting_columns",
      suggestedColumns: [{ id: "c1", name: "Retention interval", isVisible: true }],
      createdAt: now,
      updatedAt: now,
    });
  });
  await markAwaitingUserInput(t, sessionId);
  return sessionId;
}

describe("showcase db: the owner's review and research runs", () => {
  test("finds the owner's research plan behind many viewer threads, so it starts once", async () => {
    const { t, ownerId } = await setup();
    const viewerId = await insertUser(t, "viewer@example.com");
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(REVIEW.slug));
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 101; i++) {
        await ctx.db.insert("conversations", {
          userId: viewerId,
          notebookId,
          isPrivate: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    await insertResearchPlan(t, notebookId, ownerId);

    expect(
      await t.mutation(internal.showcase.db.startShowcaseDeepResearch, ref(REVIEW.slug))
    ).toBeNull();
    const plans = await t.run((ctx) => ctx.db.query("researchPlans").collect());
    expect(plans).toHaveLength(1);
  });

  test("ignores an editor's literature review waiting for columns", async () => {
    const { t } = await setup();
    const editorId = await insertUser(t, "editor@example.com");
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(REVIEW.slug));
    const sessionId = await insertWaitingReview(t, notebookId, editorId);

    expect(
      await t.mutation(internal.showcase.db.confirmShowcaseLiteratureReview, ref(REVIEW.slug))
    ).toBeNull();
    const session = await t.run((ctx) => ctx.db.get("literatureReviewSessions", sessionId));
    expect(session?.status).toBe("awaiting_columns");
    expect(session?.confirmedColumns).toBeUndefined();
  });

  test("doesn't copy an editor's finished review into Studio", async () => {
    const { t } = await setup();
    const editorId = await insertUser(t, "editor@example.com");
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(REVIEW.slug));
    await insertCompletedReview(t, notebookId, editorId);
    await expect(
      t.mutation(internal.showcase.db.copyLiteratureReviewToStudio, ref(REVIEW.slug))
    ).rejects.toThrow("hasn't finished");
    expect((await studioLiterature(t, notebookId)).tables).toEqual([]);
  });
});
