/** Whether the ranking step detail pill can open the ranked papers studio panel. */
export function canOpenRankedPapersDrilldown(stepType: string, hasSessionId: boolean): boolean {
  return stepType === "ranking" && hasSessionId;
}

/** Whether the screening step detail pill can open the screening decisions studio panel. */
export function canOpenScreeningDrilldown(stepType: string, hasSessionId: boolean): boolean {
  return stepType === "screening" && hasSessionId;
}
