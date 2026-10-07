// convex/freeTools/claimDeck.test.ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { FREE_FLASHCARD_MIN_WORDS } from "../_lib/freeToolBounds";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

const SOURCE = Array.from({ length: FREE_FLASHCARD_MIN_WORDS + 5 }, (_, i) => `w${i}`).join(" ");
const CARDS = [
  { type: "wh-question" as const, front: "What makes ATP?", back: "Mitochondria", topic: null },
  { type: "true-false" as const, front: "True or False: plants lack mitochondria.", back: "False" },
];

// Keep the scheduled docEmbedding job from running (it calls external services).
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "T" }));
}

describe("freeTools.claimDeck.claimDeck", () => {
  test("requires sign-in", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.freeTools.claimDeck.claimDeck, {
        title: "Deck",
        sourceText: SOURCE,
        cards: CARDS,
      })
    ).rejects.toThrow("Unauthenticated");
  });

  test("creates a notebook, a text source and a completed deck", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: `${userId}|s1` });

    const { notebookId, flashcardId } = await asUser.mutation(api.freeTools.claimDeck.claimDeck, {
      title: "Cell energy",
      sourceText: SOURCE,
      cards: CARDS,
    });

    const { notebook, docs, deck } = await t.run(async (ctx) => ({
      notebook: await ctx.db.get(notebookId),
      docs: await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .collect(),
      deck: await ctx.db.get(flashcardId),
    }));

    expect(notebook).toMatchObject({ userId, title: "Cell energy" });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      fileType: "text",
      fileName: "Cell energy",
      fileUrl: SOURCE,
      status: "pending",
    });
    expect(deck).toMatchObject({ userId, notebookId, status: "completed", title: "Cell energy" });
    expect(deck?.cardsData).toHaveLength(2);
    expect(deck?.metadata).toMatchObject({ cardCount: 2, source: "free_tool" });
  });

  test("rejects an empty or oversized deck", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: `${userId}|s1` });
    await expect(
      asUser.mutation(api.freeTools.claimDeck.claimDeck, {
        title: "D",
        sourceText: SOURCE,
        cards: [],
      })
    ).rejects.toThrow();
    const many = Array.from({ length: 31 }, () => CARDS[0]);
    await expect(
      asUser.mutation(api.freeTools.claimDeck.claimDeck, {
        title: "D",
        sourceText: SOURCE,
        cards: many,
      })
    ).rejects.toThrow();
  });
});
