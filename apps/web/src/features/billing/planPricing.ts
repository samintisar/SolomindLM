/**
 * Pro list prices in whole US dollars: the one copy the pricing cards, the billing page, the
 * /pricing page, pricing.md and the JSON-LD offers read. Stripe charges the prices named by
 * STRIPE_PRO_MONTHLY_PRICE_ID / STRIPE_PRO_YEARLY_PRICE_ID; change both together.
 */
export const PRO_PRICE_USD = { monthly: 15, yearly: 90 } as const;

/** The yearly plan's price per month ($7.50 for $90 a year). */
export const PRO_YEARLY_PER_MONTH_USD = PRO_PRICE_USD.yearly / 12;

/** How much cheaper yearly billing is than twelve monthly payments, in percent. */
export const PRO_YEARLY_SAVINGS_PERCENT = Math.round(
  (1 - PRO_PRICE_USD.yearly / (PRO_PRICE_USD.monthly * 12)) * 100
);

/** 0 → "$0", 15 → "$15", 7.5 → "$7.50". */
export function formatUsd(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}
