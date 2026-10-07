// convex/freeTools/claimDeck.test.ts
/// <reference types="vite/client" />

import { ConvexError, type Value } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { FREE_FLASHCARD_MAX_BODY_BYTES, FREE_FLASHCARD_MIN_WORDS } from "../_lib/freeToolBounds";
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

/** A signed-in caller whose `claim` fills in valid defaults for any arg not overridden. */
async function signedIn() {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const asUser = t.withIdentity({ subject: `${userId}|s1` });
  const claim = (overrides: Partial<{ title: string; sourceText: string; cards: typeof CARDS }>) =>
    asUser.mutation(api.freeTools.claimDeck.claimDeck, {
      title: "D",
      sourceText: SOURCE,
      cards: CARDS,
      ...overrides,
    });
  return { claim };
}

/** The ConvexError payload a rejected call carries (fails the test if it resolves). */
async function rejectionData(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    return (error as ConvexError<Value>).data;
  }
  throw new Error("expected the call to reject");
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

  test("rejects an empty or oversized deck with a structured cards error", async () => {
    const { claim } = await signedIn();
    expect(await rejectionData(claim({ cards: [] }))).toEqual({
      type: "INPUT_VALIDATION_ERROR",
      field: "cards",
      detail: "A deck needs 1–30 cards",
    });
    const many = Array.from({ length: 31 }, () => CARDS[0]);
    expect(await rejectionData(claim({ cards: many }))).toMatchObject({
      type: "INPUT_VALIDATION_ERROR",
      field: "cards",
      detail: "A deck needs 1–30 cards",
    });
    const long = [{ ...CARDS[0], back: "x".repeat(4001) }];
    expect(await rejectionData(claim({ cards: long }))).toMatchObject({
      field: "cards",
      detail: "A card is too long",
    });
  });

  test("rejects source text outside the word limits", async () => {
    const { claim } = await signedIn();
    const short = Array.from({ length: FREE_FLASHCARD_MIN_WORDS - 1 }, (_, i) => `w${i}`).join(" ");
    expect(await rejectionData(claim({ sourceText: short }))).toMatchObject({
      type: "INPUT_VALIDATION_ERROR",
      field: "sourceText",
      detail: "Source text is outside the free tool's limits",
    });
  });

  test("rejects source text over the character cap", async () => {
    const { claim } = await signedIn();
    // Few words, many characters: passes the word limits, fails the character cap.
    const huge = Array.from({ length: FREE_FLASHCARD_MIN_WORDS + 5 }, () => "a".repeat(2_500)).join(
      " "
    );
    expect(huge.length).toBeGreaterThan(FREE_FLASHCARD_MAX_BODY_BYTES);
    expect(await rejectionData(claim({ sourceText: huge }))).toMatchObject({
      type: "INPUT_VALIDATION_ERROR",
      field: "sourceText",
      detail: "Source text is too long",
    });
  });

  test("a user at the free notebook limit gets structured limit data the client can parse", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    for (let i = 0; i < 5; i++) {
      await t.run(async (ctx) =>
        ctx.db.insert("notebooks", {
          userId,
          title: `Notebook ${i}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );
    }
    const asUser = t.withIdentity({ subject: `${userId}|s1` });
    const data = await rejectionData(
      asUser.mutation(api.freeTools.claimDeck.claimDeck, {
        title: "D",
        sourceText: SOURCE,
        cards: CARDS,
      })
    );
    expect(data).toEqual({
      code: "NOTEBOOK_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "notebook",
      isPro: false,
      message: "Notebook limit reached (5/5). Please upgrade to create more notebooks.",
    });
  });
});
