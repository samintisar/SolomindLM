/// <reference types="vite/client" />
import actionCacheTest, { register as registerActionCache } from "@convex-dev/action-cache/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { uncachedLlmCall } from "../_agents/_shared/cachedLlm";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

vi.mock("../_agents/_shared/cachedLlm", () => ({ uncachedLlmCall: vi.fn() }));

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./chat/sourceSuggestions.ts", "./_agents/chat/sourceSuggestions.ts"]);
preloadModules(actionCacheTest.modules, ["./component/lib.ts"]);

const LLM_JSON = JSON.stringify({
  summary: "Notes on cells",
  suggestions: ["What is a cell?", "How do cells divide?", "What is ATP?"],
});

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function setup() {
  const t = convexTest(schema, modules);
  registerActionCache(t);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const viewer = await ctx.db.insert("users", { name: "Viewer" });
    const stranger = await ctx.db.insert("users", { name: "Stranger" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Cells",
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("documents", {
      userId: owner,
      notebookId,
      fileName: "cells.pdf",
      fileType: "file",
      status: "completed",
      createdAt: now,
      updatedAt: now,
    });
    return { owner, viewer, stranger, notebookId };
  });
  return { t, ...ids };
}

beforeEach(() => {
  vi.mocked(uncachedLlmCall).mockReset();
});

describe("chat.sourceSuggestions.getSourceSuggestions", () => {
  test("readers of the same sources share one generation", async () => {
    vi.mocked(uncachedLlmCall).mockResolvedValue({ content: LLM_JSON } as never);
    const { t, owner, viewer, notebookId } = await setup();

    const first = await withAuth(t, owner).action(api.chat.sourceSuggestions.getSourceSuggestions, {
      notebookId,
      documentSignature: "a",
    });
    // A client-made signature doesn't key the cache, so varying it doesn't buy a fresh call.
    const second = await withAuth(t, viewer).action(
      api.chat.sourceSuggestions.getSourceSuggestions,
      { notebookId, documentSignature: "b" }
    );

    expect(first).toMatchObject({ sourceCount: 1, summary: "Notes on cells" });
    expect(second).toMatchObject({
      summary: "Notes on cells",
      suggestions: ["What is a cell?", "How do cells divide?", "What is ATP?"],
      documentSignature: "b",
    });
    expect(uncachedLlmCall).toHaveBeenCalledTimes(1);
  });

  test("a new source list generates again", async () => {
    vi.mocked(uncachedLlmCall).mockResolvedValue({ content: LLM_JSON } as never);
    const { t, owner, notebookId } = await setup();

    await withAuth(t, owner).action(api.chat.sourceSuggestions.getSourceSuggestions, {
      notebookId,
      documentSignature: "a",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("documents", {
        userId: owner,
        notebookId,
        fileName: "mitochondria.pdf",
        fileType: "file",
        status: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await withAuth(t, owner).action(api.chat.sourceSuggestions.getSourceSuggestions, {
      notebookId,
      documentSignature: "a|b",
    });

    expect(uncachedLlmCall).toHaveBeenCalledTimes(2);
  });

  test("a failed generation isn't cached", async () => {
    vi.mocked(uncachedLlmCall)
      .mockResolvedValueOnce({ content: "not json" } as never)
      .mockResolvedValueOnce({ content: "still not json" } as never)
      .mockResolvedValue({ content: LLM_JSON } as never);
    const { t, owner, notebookId } = await setup();

    const failed = await withAuth(t, owner).action(
      api.chat.sourceSuggestions.getSourceSuggestions,
      { notebookId, documentSignature: "a" }
    );
    const retried = await withAuth(t, owner).action(
      api.chat.sourceSuggestions.getSourceSuggestions,
      { notebookId, documentSignature: "a" }
    );

    expect(failed).toMatchObject({ summary: null, suggestions: null });
    expect(retried).toMatchObject({ summary: "Notes on cells" });
  });

  test("a user who can't read the notebook gets nothing generated", async () => {
    vi.mocked(uncachedLlmCall).mockResolvedValue({ content: LLM_JSON } as never);
    const { t, stranger, notebookId } = await setup();
    await t.run((ctx) => ctx.db.patch(notebookId, { isPublic: false }));

    await expect(
      withAuth(t, stranger).action(api.chat.sourceSuggestions.getSourceSuggestions, {
        notebookId,
        documentSignature: "a",
      })
    ).rejects.toThrow();
    expect(uncachedLlmCall).not.toHaveBeenCalled();
  });
});
