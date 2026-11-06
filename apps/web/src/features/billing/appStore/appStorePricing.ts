/** Percent saved by paying yearly instead of twelve monthly payments; null when unknown or none. */
export function yearlySavingsPercent(
  monthlyPrice: number | null,
  yearlyPrice: number | null
): number | null {
  if (monthlyPrice === null || yearlyPrice === null || monthlyPrice <= 0) return null;
  const percent = Math.round((1 - yearlyPrice / (monthlyPrice * 12)) * 100);
  return percent > 0 ? percent : null;
}
