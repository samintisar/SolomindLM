import {
  type DailyFeature,
  type FeatureLimit,
  FREE_FEATURE_LIMITS,
  type LimitWindow,
  PRO_FEATURE_LIMITS,
} from "@convex/_lib/errors";

/**
 * Plan feature lists for the pricing cards and the billing page, built from the
 * backend's limit tables so the copy always matches what the server enforces.
 */

const PER: Record<LimitWindow, string> = { day: "a day", week: "a week", month: "every 30 days" };

function line(limit: FeatureLimit, noun: string): string {
  return `${limit.rate} ${noun} ${PER[limit.window]}`;
}

/** Studio tools shown as one "N of each" line; they share one limit per plan (tested). */
export const COMBINED_STUDIO_TOOLS: DailyFeature[] = [
  "flashcard",
  "quiz",
  "report",
  "mindmap",
  "writtenQuestion",
  "spreadsheet",
];

function requireLimit(limit: FeatureLimit | null, feature: DailyFeature): FeatureLimit {
  if (!limit) throw new Error(`${feature} has no Free limit`);
  return limit;
}

const free = (feature: DailyFeature) => requireLimit(FREE_FEATURE_LIMITS[feature], feature);
const pro = (feature: DailyFeature) => PRO_FEATURE_LIMITS[feature];

export const FREE_PLAN_FEATURES: string[] = [
  "5 notebooks, 20 sources each",
  line(free("chat"), "chat messages"),
  `${free("flashcard").rate} flashcard deck, quiz, report and mind map ${PER[free("flashcard").window]} each`,
  line(free("audio"), "audio recaps"),
  line(free("literatureReview"), "literature review"),
];

export const PRO_PLAN_FEATURES: string[] = [
  "200 notebooks, 200 sources each",
  line(pro("chat"), "chat messages"),
  `${pro("flashcard").rate} flashcard decks, quizzes, reports and mind maps ${PER[pro("flashcard").window]}`,
  line(pro("audio"), "audio recaps"),
  line(pro("literatureReview"), "literature reviews"),
  line(pro("deepResearch"), "deep research runs"),
  line(pro("infographic"), "infographics"),
];
