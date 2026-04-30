// convex/onboarding/constants.ts

export const STEP_IDS = [
  "createNotebook",
  "addSource",
  "askQuestion",
  "generateArtifact",
] as const;

export type StepId = (typeof STEP_IDS)[number];

/** Returns the step that follows `step`, or null if `step` is the last. */
export function nextStepId(step: StepId): StepId | null {
  const idx = STEP_IDS.indexOf(step);
  if (idx === -1 || idx === STEP_IDS.length - 1) return null;
  return STEP_IDS[idx + 1] ?? null;
}
