/**
 * Pro list prices shown on the billing page and the landing pricing section.
 * Stripe holds the amounts actually charged; keep these in step with it.
 */
export const PRO_PRICES = {
  monthly: "$15",
  /** Yearly plan, per month. */
  annualPerMonth: "$7.50",
  /** Yearly plan, billed once a year. */
  annualTotal: "$90",
} as const;
