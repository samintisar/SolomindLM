/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import { needsAbstractOnlyRelabel, shouldQueueReResolve } from "./backfillPaperFullText";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./_migration/backfillPaperFullText.ts", "./documents/internal.ts"]);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("needsAbstractOnlyRelabel", () => {
  const paper = {
    fileType: "paper_record",
    ingestionStatus: "ingested" as const,
    paperRecord: { abstract: "An abstract.", authors: [], isOa: false },
  };

  it("relabels an 'ingested' paper whose stored text is abstract-sized", () => {
    expect(
      needsAbstractOnlyRelabel({ ...paper, extractedMarkdown: "# T\n\n## Abstract\nAn abstract." })
    ).toBe(true);
  });

  it("keeps a paper whose stored text is full-text length", () => {
    expect(needsAbstractOnlyRelabel({ ...paper, extractedMarkdown: words(2_000) })).toBe(false);
  });

  it("keeps papers ingested by the new pipeline, other statuses, and other source types", () => {
    expect(
      needsAbstractOnlyRelabel({
        ...paper,
        extractedMarkdown: "short",
        fullTextSource: { method: "oa_pdf" },
      })
    ).toBe(false);
    expect(
      needsAbstractOnlyRelabel({
        ...paper,
        ingestionStatus: "metadata_only",
        extractedMarkdown: "short",
      })
    ).toBe(false);
    expect(
      needsAbstractOnlyRelabel({ ...paper, fileType: "url", extractedMarkdown: "short" })
    ).toBe(false);
  });
});

describe("shouldQueueReResolve", () => {
  const relabeled = {
    fileType: "paper_record",
    status: "completed" as const,
    ingestionStatus: "ingested" as const,
    extractedMarkdown: "short",
    paperRecord: { abstract: "An abstract.", authors: [], isOa: false, doi: "10.1/x" },
  };

  it("queues a completed relabeled paper with a DOI, an OpenAlex id or a PDF link", () => {
    expect(shouldQueueReResolve(relabeled)).toBe(true);
    expect(
      shouldQueueReResolve({
        ...relabeled,
        paperRecord: { ...relabeled.paperRecord, doi: undefined, openAlexId: "W1" },
      })
    ).toBe(true);
    expect(
      shouldQueueReResolve({
        ...relabeled,
        paperRecord: { ...relabeled.paperRecord, doi: " ", pdfUrl: "https://j.example/a.pdf" },
      })
    ).toBe(true);
  });

  it("skips a paper with nothing to look up", () => {
    expect(
      shouldQueueReResolve({
        ...relabeled,
        paperRecord: { ...relabeled.paperRecord, doi: " ", pdfUrl: " " },
      })
    ).toBe(false);
    expect(shouldQueueReResolve({ ...relabeled, paperRecord: undefined })).toBe(false);
  });

  it("only queues papers relabeled in this pass, never already-abstract-only ones", () => {
    expect(shouldQueueReResolve({ ...relabeled, ingestionStatus: "metadata_only" })).toBe(false);
    expect(shouldQueueReResolve({ ...relabeled, extractedMarkdown: words(2_000) })).toBe(false);
    expect(shouldQueueReResolve({ ...relabeled, fullTextSource: { method: "oa_pdf" } })).toBe(
      false
    );
  });

  it("skips a paper that is not completed", () => {
    expect(shouldQueueReResolve({ ...relabeled, status: "processing" })).toBe(false);
  });
});

describe("reingestIfStillAbstractOnly", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  type DocFields = Partial<Omit<Doc<"documents">, "_id" | "_creationTime">>;

  async function seed(over: DocFields = {}) {
    const t = convexTest(schema, modules);
    registerRateLimiter(t);
    const documentId: Id<"documents"> = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Test" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId,
        title: "Notebook",
        createdAt: 1,
        updatedAt: 1,
      });
      return ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "A paper",
        fileType: "paper_record",
        status: "completed",
        ingestionStatus: "metadata_only",
        extractedMarkdown: "# T\n\n## Abstract\nAn abstract.",
        paperRecord: { abstract: "An abstract.", authors: [], doi: "10.1/x", isOa: false },
        createdAt: 1,
        updatedAt: 1,
        ...over,
      });
    });
    return { t, documentId };
  }

  it("resets a paper that is still abstract-only", async () => {
    // Fake timers keep the scheduled docEmbedding job from running (it would call real APIs).
    vi.useFakeTimers();
    const { t, documentId } = await seed();
    const reset = await t.mutation(
      internal._migration.backfillPaperFullText.reingestIfStillAbstractOnly,
      { documentId }
    );
    expect(reset).toBe(true);
    const doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc?.status).toBe("pending");
    expect(doc?.ingestionStatus).toBe("pending");
    expect(doc?.extractedMarkdown).toBeUndefined();
  });

  it("leaves a paper alone once it has been re-ingested or is not a completed paper", async () => {
    vi.useFakeTimers();
    for (const over of [
      { ingestionStatus: "ingested" as const },
      { ingestionStatus: "pending" as const },
      { status: "processing" as const },
      { fileType: "url" },
    ]) {
      const { t, documentId } = await seed(over);
      const reset = await t.mutation(
        internal._migration.backfillPaperFullText.reingestIfStillAbstractOnly,
        { documentId }
      );
      expect(reset).toBe(false);
      const doc = await t.run((ctx) => ctx.db.get(documentId));
      expect(doc?.extractedMarkdown).toBe("# T\n\n## Abstract\nAn abstract.");
    }
  });

  it("is a no-op for a deleted paper, and the re-resolve input query returns null", async () => {
    vi.useFakeTimers();
    const { t, documentId } = await seed();
    await t.run((ctx) => ctx.db.delete(documentId));
    expect(
      await t.mutation(internal._migration.backfillPaperFullText.reingestIfStillAbstractOnly, {
        documentId,
      })
    ).toBe(false);
    expect(
      await t.query(internal._migration.backfillPaperFullText.getReResolveInput, { documentId })
    ).toBeNull();
  });
});
