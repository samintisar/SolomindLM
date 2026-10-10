import { formatUsd, PRO_PRICE_USD, PRO_YEARLY_PER_MONTH_USD } from "@/features/billing/planPricing";

/**
 * Copy for /pricing. The React page, its prerendered HTML and pricing.md read this, the plan
 * cards' PLANS (limits built from the backend's limit tables) and the billing FAQs; every price
 * comes from billing/planPricing.ts, so none of them can drift.
 */

export const PRICING_PATH = "/pricing";

const PRO_YEARLY = formatUsd(PRO_YEARLY_PER_MONTH_USD);
const PRO_MONTHLY = formatUsd(PRO_PRICE_USD.monthly);

export const PRICING_PAGE = {
  path: PRICING_PATH,
  title: "Pricing: Free and Pro Plans | SolomindLM",
  description: `SolomindLM is free to start with no card. Pro is ${PRO_YEARLY}/month billed yearly or ${PRO_MONTHLY}/month billed monthly, with more notebooks, sources and daily generations.`,
  keywords:
    "SolomindLM pricing, SolomindLM Pro, AI study tool price, free AI study tool, AI research assistant pricing",
  h1: "SolomindLM pricing",
  h1Accent: "pricing",
  lede: "Start free with no credit card. Pro raises the notebook, source and daily generation limits when you need more.",
  breadcrumbs: [
    { name: "Home", path: "/" },
    { name: "Pricing", path: PRICING_PATH },
  ],
  /** Shown under the plan cards. */
  currencyNote: "Prices in US dollars.",
  closing: {
    body: "Create a free account, add your first sources, and upgrade only if you need more.",
    ctaLabel: "Start free",
  },
};
