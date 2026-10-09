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

// Seed only the fields the backfill reads.
const looseSchema = defineSchema(schema.tables, { schemaValidation: false });

const PAGED = [
  "**Page 1**",
  "",
  "Alpha on page one.",
  "",
  "---",
  "",
  "**Page 2**",
  "",
  "Beta on page two.",
  "",
  "---",
  "",
  "**Page 3**",
  "",
  "Gamma on page three.",
].join("\n");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("backfillChunkPages", () => {
  test("sets each chunk's page from the OCR labels and leaves other documents alone", async () => {
    const t = convexTest(looseSchema, modules);

    const ids = await t.run(async (ctx) => {
      const insertDoc = (extractedMarkdown: string | undefined) =>
        ctx.db.insert("documents", { extractedMarkdown } as never) as Promise<Id<"documents">>;
      const insertChunk = (
        documentId: Id<"documents">,
        chunkIndex: number,
        content: string,
        relativePosition: number,
        pageNumber?: number
      ) =>
        ctx.db.insert("documentChunks", {
          documentId,
          chunkIndex,
          content,
          relativePosition,
          pageNumber,
        } as never);

      const paged = await insertDoc(PAGED);
      const plain = await insertDoc("No labels here.");
      const empty = await insertDoc(undefined);
      const second = await insertDoc("**Page 1**\n\nOne.\n\n---\n\n**Page 2**\n\nTwo.");
      return {
        alpha: await insertChunk(paged, 0, "**Page 1**\n\nAlpha on page one.", 0),
        beta: await insertChunk(paged, 1, "Beta on page two.", 0.5),
        gamma: await insertChunk(paged, 2, "---\n\n**Page 3**\n\nGamma on page three.", 1),
        missing: await insertChunk(paged, 3, "Text that is not in the markdown.", 1),
        plain: await insertChunk(plain, 0, "No labels here.", 0),
        empty: await insertChunk(empty, 0, "Anything.", 0),
        // Written by the chunker: must not be replaced by a text search.
        preset: await insertChunk(paged, 4, "Beta on page two.", 0.5, 4),
        // Reached only after the walk passes through the unlabeled documents.
        two: await insertChunk(second, 0, "Two.", 1),
      };
    });

    await t.mutation(internal._migration.backfillChunkPages.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const pages = await t.run(async (ctx) => {
      const pageOf = async (id: (typeof ids)[keyof typeof ids]) =>
        (await ctx.db.get(id))?.pageNumber;
      return {
        alpha: await pageOf(ids.alpha),
        beta: await pageOf(ids.beta),
        gamma: await pageOf(ids.gamma),
        missing: await pageOf(ids.missing),
        plain: await pageOf(ids.plain),
        empty: await pageOf(ids.empty),
        preset: await pageOf(ids.preset),
        two: await pageOf(ids.two),
      };
    });

    expect(pages).toEqual({
      alpha: 1,
      beta: 2,
      // An old chunk that opens on the separator and label belongs to the page its text starts on.
      gamma: 3,
      missing: undefined,
      plain: undefined,
      empty: undefined,
      preset: 4,
      two: 2,
    });
  });

  test("walks a document's chunks across several batches", async () => {
    const t = convexTest(looseSchema, modules);
    const chunkCount = 450; // > 2 batches of 200
    const docId = await t.run(async (ctx) => {
      const documentId = (await ctx.db.insert("documents", {
        extractedMarkdown: PAGED,
      } as never)) as Id<"documents">;
      for (let i = 0; i < chunkCount; i++) {
        await ctx.db.insert("documentChunks", {
          documentId,
          chunkIndex: i,
          content: "Gamma on page three.",
          relativePosition: 1,
        } as never);
      }
      return documentId;
    });

    await t.mutation(internal._migration.backfillChunkPages.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const unset = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query("documentChunks")
            .withIndex("by_document", (q) => q.eq("documentId", docId))
            .collect()
        ).filter((c) => c.pageNumber !== 3).length
    );
    expect(unset).toBe(0);
  });
});
