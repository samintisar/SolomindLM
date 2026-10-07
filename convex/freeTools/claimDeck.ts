// convex/freeTools/claimDeck.ts
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import {
  countWords,
  FREE_FLASHCARD_CARD_COUNTS,
  FREE_FLASHCARD_MAX_BODY_BYTES,
  FREE_FLASHCARD_MAX_WORDS,
  FREE_FLASHCARD_MIN_WORDS,
} from "../_lib/freeToolBounds";
import { checkNotebookLimit } from "../_lib/limits";
import { toConvexError } from "../_lib/serviceErrors";
import { TEXT_TITLE_MAX_LENGTH } from "../_lib/textTitle";
import * as Notebooks from "../_model/notebooks";
import { normalizeMathMarkdownDeep } from "../_shared/mathMarkdown";
import { getAuthUserId } from "../auth";
import { freeDeckCardValidator } from "./validators";

const MAX_CARDS = Math.max(...FREE_FLASHCARD_CARD_COUNTS);
const MAX_CARD_SIDE_CHARS = 4000;

/** A structured INPUT_VALIDATION_ERROR the web client parses with `parseServiceError`. */
function invalid(message: string, field: "sourceText" | "cards") {
  return toConvexError(new InputValidationError(message, { field }));
}

/**
 * Save a deck made with the free tool: new notebook + the source text as a `text` source
 * (embedded like any pasted text) + a completed flashcard set ready for the Due queue.
 */
export const claimDeck = mutation({
  args: {
    title: v.string(),
    sourceText: v.string(),
    cards: v.array(freeDeckCardValidator),
  },
  returns: v.object({ notebookId: v.id("notebooks"), flashcardId: v.id("flashcards") }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    // Character cap first: it is cheap and bounds the work countWords does.
    if (args.sourceText.length > FREE_FLASHCARD_MAX_BODY_BYTES) {
      throw invalid("Source text is too long", "sourceText");
    }
    const words = countWords(args.sourceText);
    if (words < FREE_FLASHCARD_MIN_WORDS || words > FREE_FLASHCARD_MAX_WORDS) {
      throw invalid("Source text is outside the free tool's limits", "sourceText");
    }
    if (args.cards.length === 0 || args.cards.length > MAX_CARDS) {
      throw invalid(`A deck needs 1–${MAX_CARDS} cards`, "cards");
    }
    if (
      args.cards.some(
        (c) => c.front.length > MAX_CARD_SIDE_CHARS || c.back.length > MAX_CARD_SIDE_CHARS
      )
    ) {
      throw invalid("A card is too long", "cards");
    }

    await checkNotebookLimit(ctx);

    const title = (args.title.trim() || "Flashcards").slice(0, TEXT_TITLE_MAX_LENGTH);
    const notebookId = await Notebooks.createNotebook(ctx, { userId, title });
    const now = Date.now();

    // Same shape documents.upload writes for pasted text (fileUrl holds the text).
    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId,
      fileName: title,
      fileType: "text",
      fileUrl: args.sourceText,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.documents.embeddingJob.docEmbedding, {
      documentId,
      userId,
      notebookId,
    });

    const cards = normalizeMathMarkdownDeep(args.cards);
    const flashcardId = await ctx.db.insert("flashcards", {
      userId,
      notebookId,
      title,
      status: "completed",
      cardsData: cards,
      metadata: {
        title,
        cardCount: args.cards.length,
        phase: "completed",
        progress: 100,
        completedAt: now,
        source: "free_tool",
      },
      createdAt: now,
      updatedAt: now,
    });

    return { notebookId, flashcardId };
  },
});
