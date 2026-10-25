/// <reference types="vite/client" />

import { defineSchema } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

// Seed only the fields the migration reads.
const looseSchema = defineSchema(schema.tables, { schemaValidation: false });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const insertDoc = (extractedMarkdown: string | undefined) =>
      ctx.db.insert("documents", { extractedMarkdown, updatedAt: 5 } as never) as Promise<
        Id<"documents">
      >;
    // More than one batch, so the scan has to continue in later mutations.
    const legacy: Id<"documents">[] = [];
    for (let i = 0; i < 20; i++) legacy.push(await insertDoc(`Text ${i}.`));
    const empty = await insertDoc(undefined);
    // Text written by the new code after the old copy: the newer one wins.
    const both = await insertDoc("Stale text.");
    await ctx.db.insert("documentContents", { documentId: both, extractedMarkdown: "Fresh text." });
    return { legacy, empty, both };
  });
}

async function snapshot(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => ({
    docs: await ctx.db.query("documents").collect(),
    contents: await ctx.db.query("documentContents").collect(),
  }));
}

async function run(t: ReturnType<typeof convexTest>, dryRun: boolean) {
  await t.mutation(internal._migration.moveDocumentText.start, { dryRun });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("moveDocumentText", () => {
  test("moves every document's text to documentContents and clears the row", async () => {
    const t = convexTest(looseSchema, modules);
    const { legacy, empty, both } = await seed(t);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await run(t, false);

    const { docs, contents } = await snapshot(t);
    expect(docs.every((d) => d.extractedMarkdown === undefined)).toBe(true);
    // updatedAt is untouched, so forks don't take the move for a reprocess.
    expect(docs.every((d) => d.updatedAt === 5)).toBe(true);
    const textOf = new Map(contents.map((c) => [c.documentId, c.extractedMarkdown]));
    expect(contents).toHaveLength(21);
    legacy.forEach((id, i) => {
      expect(textOf.get(id)).toBe(`Text ${i}.`);
    });
    expect(textOf.get(both)).toBe("Fresh text.");
    expect(textOf.has(empty)).toBe(false);
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({
      migration: "moveDocumentText",
      scanned: 22,
      moved: 20,
      cleared: 1,
    });

    // A second run finds nothing left.
    await run(t, true);
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({
      moved: 0,
      cleared: 0,
    });
    log.mockRestore();
  });

  test("a dry run counts without writing", async () => {
    const t = convexTest(looseSchema, modules);
    await seed(t);
    const before = await snapshot(t);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await run(t, true);

    expect(await snapshot(t)).toEqual(before);
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({
      dryRun: true,
      moved: 20,
      cleared: 1,
    });
    log.mockRestore();
  });
});
