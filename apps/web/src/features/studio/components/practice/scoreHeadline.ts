/** Results headline for a score fraction from 0 to 1. */
export function scoreHeadline(fraction: number): string {
  if (fraction >= 1) return "Perfect score";
  if (fraction >= 0.7) return "Nicely done";
  if (fraction >= 0.4) return "Good effort";
  return "Keep practising";
}
