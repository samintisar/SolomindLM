/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
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
