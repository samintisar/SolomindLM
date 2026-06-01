import { v } from "convex/values";
import { mutation } from "../_generated/server";

/**
 * Create a flashcard deck with sample cards for E2E testing.
 */
export const createFlashcardDeck = mutation({
  args: {
    email: v.string(),
    notebookId: v.string(),
    title: v.string(),
  },
  returns: v.object({
    flashcardId: v.string(),
    title: v.string(),
    cardCount: v.number(),
  }),
  handler: async (ctx, { email, notebookId, title }) => {
    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      throw new Error(`User with email ${email} not found`);
    }

    const now = Date.now();

    const flashcardId = await ctx.db.insert("flashcards", {
      userId: user._id,
      notebookId: notebookId as any,
      title,
      status: "completed",
      cardsData: [
        {
          id: "card-1",
          front: "What is spaced repetition?",
          back: "A learning technique that involves reviewing information at increasing intervals to improve long-term retention.",
          difficulty: "medium",
        },
        {
          id: "card-2",
          front: "What should the Good button do on a new flashcard?",
          back: "Show the card again in about 10 minutes for initial review.",
          difficulty: "easy",
        },
        {
          id: "card-3",
          front: "What is active recall?",
          back: "The practice of actively stimulating memory during the learning process, rather than passively reviewing material.",
          difficulty: "medium",
        },
      ],
      metadata: {
        questionCount: 3,
        difficulty: "medium",
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      flashcardId: flashcardId.toString(),
      title,
      cardCount: 3,
    };
  },
});
