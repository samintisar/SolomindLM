/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("backfillNotebookSourceCount", () => {
  test("counts each notebook's documents and keeps stored counts unless forced", async () => {
    const t = convexTest(schema, modules);

    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", { name: "Test" });
      const notebook = (title: string, sourceCount?: number) =>
        ctx.db.insert("notebooks", { userId, title, sourceCount, createdAt: now, updatedAt: now });
      const addDocuments = async (notebookId: Id<"notebooks">, n: number) => {
        for (let i = 0; i < n; i++) {
          await ctx.db.insert("documents", {
            userId,
            notebookId,
            fileName: `doc ${i}`,
            fileType: "text",
            status: "completed",
            createdAt: now,
            updatedAt: now,
          });
        }
      };
      const many = await notebook("Many");
      await addDocuments(many, 23);
      const empty = await notebook("Empty");
      const counted = await notebook("Counted", 7);
      await addDocuments(counted, 2);
      return { many, empty, counted };
    });

    await t.mutation(internal._migration.backfillNotebookSourceCount.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const counts = await t.run(async (ctx) => ({
      many: (await ctx.db.get(ids.many))?.sourceCount,
      empty: (await ctx.db.get(ids.empty))?.sourceCount,
      counted: (await ctx.db.get(ids.counted))?.sourceCount,
    }));
    expect(counts).toEqual({ many: 23, empty: 0, counted: 7 });

    // `force` repairs a count that drifted through writes that skip the triggers.
    await t.mutation(internal._migration.backfillNotebookSourceCount.start, { force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(ids.counted)))?.sourceCount).toBe(2);
  });
});
