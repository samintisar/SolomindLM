import type { EvalFixture } from "../../types";
import {
  AGENTIC_20_ITEMS,
  AGENTIC_20_NOTEBOOK_ID,
  AGENTIC_20_SOURCE_FILES,
} from "../agentic-patterns-20";

/**
 * Studio eval: flashcards covering the 20 agentic-patterns notebook.
 *
 * Pinned to the same notebook as `agentic-patterns-20` so the patterns list
 * is the ground truth: a 20+ card set that mentions each pattern (front or
 * back) is a pass. `expectedItemRecall` runs over the serialized text of
 * all cards.
 */
export const studioFlashcardsAgentic20: EvalFixture = {
  schemaVersion: 1,
  id: "studio-flashcards-agentic-patterns-20",
  question: "Generate flashcards covering the 20 agentic AI design patterns.",
  runner: "flashcards",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  sourceFiles: [...AGENTIC_20_SOURCE_FILES],
  expectedItems: [...AGENTIC_20_ITEMS],
  expectedBehavior:
    "Flashcards should cover all 20 patterns. Each pattern should appear by name " +
    "on the front or back of at least one card, with an accurate description on the back.",
  studioParams: { cardCount: 25, difficulty: "medium" },
  expectedStructure: { minItems: 20 },
  tags: ["studio", "flashcards", "list-enumeration", "agentic-patterns"],
};
