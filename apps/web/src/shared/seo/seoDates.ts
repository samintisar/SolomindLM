const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "2026-10-07" → "October 7, 2026". Formatted in UTC so the prerendered HTML (built on any
 * machine) and the hydrated page (any visitor time zone) show the same day.
 */
export function formatSeoDate(isoDate: string): string {
  if (!ISO_DATE.test(isoDate)) {
    throw new Error(`formatSeoDate: expected YYYY-MM-DD, got "${isoDate}"`);
  }
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `<time>` element for prerendered HTML; the React pages render the same markup. */
export function buildSeoTimeHtml(isoDate: string): string {
  return `<time datetime="${isoDate}">${formatSeoDate(isoDate)}</time>`;
}

/** The visible "Updated <date>" line under a prerendered content-page header. */
export function buildUpdatedLineHtml(isoDate: string): string {
  return `<p>Updated ${buildSeoTimeHtml(isoDate)}</p>`;
}
