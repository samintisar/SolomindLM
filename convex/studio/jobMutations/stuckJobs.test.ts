/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import {
  STUCK_JOB_ERROR_MESSAGE,
  STUCK_JOB_SWEEP_BATCH_SIZE,
  STUDIO_JOB_STALE_MS,
} from "./stuckJobs";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

type T = ReturnType<typeof convexTest>;

const STUDIO_TABLES = [
  "reports",
  "audioOverviews",
  "flashcards",
  "mindmaps",
  "quizzes",
  "infographics",
  "spreadsheets",
  "writtenQuestions",
] as const;
type StudioTable = (typeof STUDIO_TABLES)[number];

/** Extra required fields per table beyond the shared job columns. */
const REQUIRED_FIELDS: Record<StudioTable, Record<string, unknown>> = {
  reports: {},
  audioOverviews: {},
  flashcards: {},
  mindmaps: { data: null },
  quizzes: {},
  infographics: { data: null },
  spreadsheets: { data: null },
  writtenQuestions: { questionsData: [], questionType: "short" },
};

async function seedNotebook(t: T) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Test" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { userId, notebookId };
  });
}

async function seedJob(
  t: T,
  owner: { userId: Id<"users">; notebookId: Id<"notebooks"> },
  table: StudioTable,
  opts: { status: string; updatedAt: number; metadata?: Record<string, unknown> }
) {
  return t.run(async (ctx) => {
    const doc = {
      ...owner,
      ...REQUIRED_FIELDS[table],
      title: `${table} job`,
      status: opts.status,
      metadata: opts.metadata,
      createdAt: opts.updatedAt,
      updatedAt: opts.updatedAt,
    };
    // Each table has the same job columns; the cast keeps the loop generic.
    return (await ctx.db.insert(table, doc as never)) as Id<StudioTable>;
  });
}

async function getJob(t: T, id: Id<StudioTable>) {
  return t.run(async (ctx) => ctx.db.get(id));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("sweepStuckStudioJobs", () => {
  test.each(STUDIO_TABLES)("fails a %s job whose action stopped updating it", async (table) => {
    const t = convexTest(schema, modules);
    const owner = await seedNotebook(t);
    const id = await seedJob(t, owner, table, {
      status: "generating",
      updatedAt: Date.now() - STUDIO_JOB_STALE_MS - 60_000,
      metadata: { phase: "collapsing", progress: 70, currentStep: "Consolidating data..." },
    });

    const result = await t.mutation(
      internal.studio.jobMutations.stuckJobs.sweepStuckStudioJobs,
      {}
    );

    expect(result.failed).toBe(1);
    const job = await getJob(t, id);
    expect(job?.status).toBe("failed");
    expect(job?.metadata?.error?.message).toBe(STUCK_JOB_ERROR_MESSAGE);
    expect(job?.metadata?.error?.phase).toBe("collapsing");
    expect(job?.metadata?.progress).toBe(70);
    expect(job?.updatedAt).toBeGreaterThan(Date.now() - 60_000);
  });

  test("leaves a job alone while its action keeps updating it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedNotebook(t);
    const id = await seedJob(t, owner, "flashcards", {
      status: "generating",
      updatedAt: Date.now() - STUDIO_JOB_STALE_MS + 60_000,
      metadata: { phase: "map_processing", progress: 40 },
    });

    const result = await t.mutation(
      internal.studio.jobMutations.stuckJobs.sweepStuckStudioJobs,
      {}
    );

    expect(result.failed).toBe(0);
    const job = await getJob(t, id);
    expect(job?.status).toBe("generating");
    expect(job?.metadata?.phase).toBe("map_processing");
  });

  test.each(["completed", "failed", "draft"])("ignores old %s jobs", async (status) => {
    const t = convexTest(schema, modules);
    const owner = await seedNotebook(t);
    const staleAt = Date.now() - STUDIO_JOB_STALE_MS * 10;
    const id = await seedJob(t, owner, "reports", { status, updatedAt: staleAt });

    const result = await t.mutation(
      internal.studio.jobMutations.stuckJobs.sweepStuckStudioJobs,
      {}
    );

    expect(result.failed).toBe(0);
    const job = await getJob(t, id);
    expect(job?.status).toBe(status);
    expect(job?.updatedAt).toBe(staleAt);
  });

  test("records an unknown phase when the job never set one", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedNotebook(t);
    const id = await seedJob(t, owner, "quizzes", {
      status: "generating",
      updatedAt: Date.now() - STUDIO_JOB_STALE_MS - 1,
    });

    await t.mutation(internal.studio.jobMutations.stuckJobs.sweepStuckStudioJobs, {});

    const job = await getJob(t, id);
    expect(job?.status).toBe("failed");
    expect(job?.metadata?.error?.phase).toBe("unknown");
  });

  test("continues in a new transaction when one table has more stuck jobs than a batch", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const owner = await seedNotebook(t);
    const ids: Id<StudioTable>[] = [];
    for (let i = 0; i < STUCK_JOB_SWEEP_BATCH_SIZE + 2; i++) {
      ids.push(
        await seedJob(t, owner, "spreadsheets", {
          status: "generating",
          updatedAt: Date.now() - STUDIO_JOB_STALE_MS - 1_000 - i,
          metadata: { phase: "collapsing" },
        })
      );
    }

    const first = await t.mutation(internal.studio.jobMutations.stuckJobs.sweepStuckStudioJobs, {});
    expect(first.failed).toBe(STUCK_JOB_SWEEP_BATCH_SIZE);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    for (const id of ids) {
      expect((await getJob(t, id))?.status).toBe("failed");
    }
  });
});
