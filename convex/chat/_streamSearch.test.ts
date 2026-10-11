import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

const { cachedRerank } = vi.hoisted(() => ({ cachedRerank: vi.fn(async () => []) }));
vi.mock("../_agents/chat/rerankCache.js", () => ({ cachedRerank }));

import {
  createChatVectorSearchRunner,
  createFetchDocumentTitleFn,
  createRerankFn,
} from "./_streamSearch";

describe("createRerankFn", () => {
  it("asks the reranker to score every candidate, so no chunk keeps a different score scale", async () => {
    const docs = Array.from({ length: 37 }, (_, i) => ({ id: `d${i}`, content: `chunk ${i}` }));

    await createRerankFn({} as ActionCtx)("query", docs);

    expect(cachedRerank).toHaveBeenCalledWith(expect.anything(), "query", docs, 37);
  });
});

describe("createFetchDocumentTitleFn", () => {
  it("returns the document's file name without loading its chunks", async () => {
    const runQuery = vi.fn(async () => [{ _id: "doc-a", fileName: "a.pdf" }]);
    const ctx = { runQuery } as unknown as ActionCtx;

    await expect(createFetchDocumentTitleFn(ctx)("doc-a")).resolves.toBe("a.pdf");
    expect(runQuery).toHaveBeenCalledTimes(1);
    await expect(
      createFetchDocumentTitleFn({ runQuery: vi.fn(async () => []) } as unknown as ActionCtx)(
        "gone"
      )
    ).resolves.toBeUndefined();
  });
});

// #450: a search over selected sources must reach their own passages, not the notebook's top hits.
describe("createChatVectorSearchRunner with selected documents", () => {
  const notebookId = "nb-1" as Id<"notebooks">;
  const chunk = (id: string, documentId: string, notebook = notebookId) => ({
    _id: id,
    documentId,
    notebookId: notebook,
    chunkIndex: 0,
    content: `text ${id}`,
  });

  function fakeCtx(hits: Array<{ _id: string; _score: number }>, chunks: unknown[]) {
    const vectorSearch = vi.fn(async () => hits);
    const runQuery = vi
      .fn()
      .mockResolvedValueOnce(chunks)
      .mockResolvedValueOnce([{ _id: "doc-a", fileName: "a.pdf" }]);
    return { ctx: { vectorSearch, runQuery } as unknown as ActionCtx, vectorSearch };
  }

  it("filters the vector search by the document and asks only for the limit", async () => {
    const { ctx, vectorSearch } = fakeCtx([{ _id: "c1", _score: 0.6 }], [chunk("c1", "doc-a")]);

    const rows = await createChatVectorSearchRunner(ctx, notebookId)([0.1], 4, ["doc-a"]);

    const [, , opts] = vectorSearch.mock.calls[0] as unknown as [
      string,
      string,
      { limit: number; filter: (q: { eq: (f: string, v: string) => unknown }) => unknown },
    ];
    expect(opts.limit).toBe(4);
    expect(opts.filter({ eq: (f, v) => [f, v] })).toEqual(["documentId", "doc-a"]);
    expect(rows.map((r) => r.sourceTitle)).toEqual(["a.pdf"]);
  });

  it("filters a search over several documents to those documents", async () => {
    const { ctx, vectorSearch } = fakeCtx([{ _id: "c1", _score: 0.6 }], [chunk("c1", "doc-a")]);

    await createChatVectorSearchRunner(ctx, notebookId)([0.1], 4, ["doc-a", "doc-b"]);

    const [, , opts] = vectorSearch.mock.calls[0] as unknown as [
      string,
      string,
      {
        limit: number;
        filter: (q: {
          eq: (f: string, v: string) => unknown;
          or: (...e: unknown[]) => unknown;
        }) => unknown;
      },
    ];
    expect(opts.limit).toBe(4);
    expect(opts.filter({ eq: (f, v) => [f, v], or: (...e) => ({ or: e }) })).toEqual({
      or: [
        ["documentId", "doc-a"],
        ["documentId", "doc-b"],
      ],
    });
  });

  it("drops a chunk from another notebook", async () => {
    const { ctx } = fakeCtx(
      [{ _id: "c1", _score: 0.6 }],
      [chunk("c1", "doc-a", "nb-2" as Id<"notebooks">)]
    );

    const rows = await createChatVectorSearchRunner(ctx, notebookId)([0.1], 4, ["doc-a"]);

    expect(rows).toEqual([]);
  });
});
