import { v } from "convex/values";

// ── Length limits ──────────────────────────────────────────────────────
export const PROMPT_TEXT_MAX_LENGTH = 2000;
export const PROMPT_TITLE_MAX_LENGTH = 100;
export const PROMPT_DESCRIPTION_MAX_LENGTH = 300;

// ── Moderation ────────────────────────────────────────────────────────
/** Auto-hide a public prompt once it accumulates this many reports. */
export const PROMPT_REPORT_AUTO_HIDE_THRESHOLD = 5;
/** Max length for report reason (abuse hardening). */
export const PROMPT_REPORT_REASON_MAX_LENGTH = 500;

// ── Bayesian rating ───────────────────────────────────────────────────
export const RATING_PRIOR_MEAN = 4.0;
export const RATING_PRIOR_COUNT = 5;

// ── Shared validators ─────────────────────────────────────────────────
export const studioToolValidator = v.union(
  v.literal("report"),
  v.literal("spreadsheet"),
  v.literal("infographic"),
  v.literal("flashcards"),
  v.literal("quiz"),
  v.literal("audio"),
  v.literal("writtenQuestions"),
  v.literal("mindmap")
);

export type StudioTool =
  | "report"
  | "spreadsheet"
  | "infographic"
  | "flashcards"
  | "quiz"
  | "audio"
  | "writtenQuestions"
  | "mindmap";
