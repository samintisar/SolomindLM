import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { initializeProficiency } from "../_lib/srsScheduling";

const e2eCardValidator = v.object({
  type: v.union(
    v.literal("wh-question"),
    v.literal("fill-blank"),
    v.literal("true-false"),
    v.literal("definition"),
    v.literal("scenario")
  ),
  front: v.string(),
  back: v.string(),
  topic: v.optional(v.string()),
});

/**
 * E2E-only seed helper: creates a completed flashcard artifact without invoking AI generation.
 */
export const createFlashcardDeck = internalMutation({
  args: {
    email: v.string(),
    notebookId: v.id("notebooks"),
    title: v.string(),
    cards: v.optional(v.array(e2eCardValidator)),
  },
  returns: v.object({
    flashcardId: v.id("flashcards"),
    title: v.string(),
    cardCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim();
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), email))
      .first();
    if (!user) {
      throw new Error(`No user with email: ${email}`);
    }

    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== user._id) {
      throw new Error("Notebook not found for E2E user");
    }

    const cards = args.cards ?? [
      {
        type: "definition" as const,
        front: "What is spaced repetition?",
        back: "A study method that reviews material at increasing intervals.",
        topic: "SRS",
      },
      {
        type: "wh-question" as const,
        front: "What should the Good button do on a new flashcard?",
        back: "Move it to the next learning step before graduating it.",
        topic: "SRS",
      },
      {
        type: "wh-question" as const,
        front: "Why should Hard appear before Good?",
        back: "Hard means recall was difficult, so the next review should be sooner than Good.",
        topic: "SRS",
      },
    ];
    const cardsData = cards.map((card) => ({
      ...card,
      proficiency: initializeProficiency(),
    }));
    const now = Date.now();

    const flashcardId = await ctx.db.insert("flashcards", {
      userId: user._id,
      notebookId: args.notebookId,
      title: args.title,
      status: "completed",
      cardsData,
      metadata: {
        difficulty: "medium",
        cardCount: cardsData.length,
        showMastered: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    return { flashcardId, title: args.title, cardCount: cardsData.length };
  },
});
