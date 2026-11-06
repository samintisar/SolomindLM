/**
 * OCR page caps. Mistral bills every OCR'd page, and a single textbook upload (300-900 pages)
 * costs more than a month of ordinary lecture slides, so each file is cut off at `perFile` pages
 * and each user gets `perMonth` pages per calendar month (UTC), which bounds what one user's OCR
 * can cost in a month.
 */

import { UserFacingSourceError } from "./sourceFailure";

export type OcrPageLimits = { perFile: number; perMonth: number };

export const OCR_PAGE_LIMITS = {
  free: { perFile: 30, perMonth: 100 },
  pro: { perFile: 200, perMonth: 1000 },
} as const satisfies Record<"free" | "pro", OcrPageLimits>;

export function ocrPageLimitsFor(isPro: boolean): OcrPageLimits {
  return isPro ? OCR_PAGE_LIMITS.pro : OCR_PAGE_LIMITS.free;
}

/**
 * Pages one OCR call may read: the per-file cap, or what is left of the month if less.
 * `bonusPages` (granted by staff for one month) raises the month's allowance, not the per-file cap.
 */
export function ocrPagesToGrant(
  limits: OcrPageLimits,
  usedThisMonth: number,
  bonusPages = 0
): number {
  return Math.max(0, Math.min(limits.perFile, limits.perMonth + bonusPages - usedThisMonth));
}

/** Mistral's `pages` value for the first `count` pages (zero-based, inclusive range). */
export function ocrPageRange(count: number): string {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`OCR page count must be a positive integer, got ${count}`);
  }
  return count === 1 ? "0" : `0-${count - 1}`;
}

/** The usage row's month, e.g. "2026-11". */
export function ocrMonthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

/**
 * Shown on a source that OCR stopped short of its end, or undefined when it read fewer pages than
 * it was allowed (the file ended first). A file of exactly the allowed length also gets it: OCR
 * can't tell, and the notice is true either way.
 */
export function ocrPageCapNotice({
  pagesRead,
  granted,
  limits,
  isPro,
}: {
  pagesRead: number;
  granted: number;
  limits: OcrPageLimits;
  isPro: boolean;
}): string | undefined {
  if (granted <= 0 || pagesRead < granted) return undefined;
  if (granted < limits.perFile) {
    return `Only the first ${granted} pages of this file were read: that was what was left of your ${limits.perMonth} pages this month.${proGivesMoreMonthly(limits, isPro) ? " Upgrade to Pro for more." : ""}`;
  }
  return isPro
    ? `Only the first ${granted} pages of this file were read (the limit per file). Split longer files into chapters to add the rest.`
    : `Only the first ${granted} pages of this file were read (the Free plan limit per file). Split longer files into chapters, or upgrade to Pro to read up to ${OCR_PAGE_LIMITS.pro.perFile} pages per file.`;
}

/**
 * Whether suggesting Pro for more monthly pages is true: `limits.perMonth` includes any bonus, which
 * can put a Free user at or above Pro's allowance.
 */
function proGivesMoreMonthly(limits: OcrPageLimits, isPro: boolean): boolean {
  return !isPro && limits.perMonth < OCR_PAGE_LIMITS.pro.perMonth;
}

/** Why a file that needs OCR could not be read once the month's pages are used up. */
export function ocrQuotaExhaustedMessage(limits: OcrPageLimits, isPro: boolean): string {
  return `You've used your ${limits.perMonth} pages of PDF, slide, and image reading for this month. It resets next month.${proGivesMoreMonthly(limits, isPro) ? ` Upgrade to Pro for ${OCR_PAGE_LIMITS.pro.perMonth} pages a month.` : ""}`;
}

/**
 * The month's OCR pages are used up. Its own class so callers that wrap or swallow OCR failures
 * (PDF links, paper ingest) pass it through and the user sees why.
 */
export class OcrQuotaExceededError extends UserFacingSourceError {
  constructor(limits: OcrPageLimits, isPro: boolean) {
    super(ocrQuotaExhaustedMessage(limits, isPro), "Monthly OCR page allowance used up");
    this.name = "OcrQuotaExceededError";
  }
}
