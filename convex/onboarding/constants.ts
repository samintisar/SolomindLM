// convex/onboarding/constants.ts

/**
 * Window after `users._creationTime` during which a user without a `userOnboarding`
 * row is treated as a fresh signup (returns tourStatus: "pending"). Past this
 * window, the user is treated as legacy (returns tourStatus: "completed").
 *
 * Failure mode: a user who signs up but doesn't reach /home for >5 minutes (rare —
 * would require closing the tab during signup) gets bucketed as "completed" and
 * won't see the tour. The "Restart tour" menu item in the avatar dropdown is the
 * recovery path.
 */
export const FRESH_USER_WINDOW_MS = 5 * 60_000;

export const STEP_IDS = [
  "createNotebook",
  "addSource",
  "askQuestion",
  "openStudio",
  "generateArtifact",
] as const;

export type StepId = (typeof STEP_IDS)[number];

/** Returns the step that follows `step`, or null if `step` is the last. */
export function nextStepId(step: StepId): StepId | null {
  const idx = STEP_IDS.indexOf(step);
  if (idx === -1 || idx === STEP_IDS.length - 1) return null;
  return STEP_IDS[idx + 1] ?? null;
}
