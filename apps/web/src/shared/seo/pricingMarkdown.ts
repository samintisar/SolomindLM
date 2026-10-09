import {
  formatUsd,
  PRO_PRICE_USD,
  PRO_YEARLY_PER_MONTH_USD,
  PRO_YEARLY_SAVINGS_PERCENT,
} from "@/features/billing/planPricing";
import { PLANS } from "@/features/landing/components/home/landingHomeContent";
import { getBillingFaqs } from "@/features/landing/faqRegistry";
import { PRICING_PAGE, PRICING_PATH } from "@/features/landing/pricingPageContent";
import { SEO_BASE_URL } from "./seoConstants";
import { canonicalUrl } from "./seoHtml";

/** One row per way to pay: Free, Pro billed yearly, Pro billed monthly. */
const PRICE_ROWS = [
  { plan: "Free", price: formatUsd(0), billing: "Free forever, no card required" },
  {
    plan: "Pro, billed yearly",
    price: `${formatUsd(PRO_YEARLY_PER_MONTH_USD)} / month`,
    billing: `${formatUsd(PRO_PRICE_USD.yearly)} billed once a year (save ${PRO_YEARLY_SAVINGS_PERCENT}%)`,
  },
  {
    plan: "Pro, billed monthly",
    price: `${formatUsd(PRO_PRICE_USD.monthly)} / month`,
    billing: "Billed every month",
  },
];

/**
 * pricing.md: a plain-text pricing summary for AI crawlers and agents. scripts/generate-pricing-md.ts
 * writes it to public/ and dist/ at build time from the same data as the /pricing page.
 */
export function buildPricingMarkdown(): string {
  const rows = PRICE_ROWS.map((row) => `| ${row.plan} | ${row.price} | ${row.billing} |`).join(
    "\n"
  );

  const plans = PLANS.map(
    (plan) =>
      `## ${plan.name}\n\n${plan.description}\n\n${plan.features.map((feature) => `- ${feature}`).join("\n")}`
  ).join("\n\n");

  const faqs = getBillingFaqs()
    .map((faq) => `### ${faq.question}\n\n${faq.answer}`)
    .join("\n\n");

  return `# SolomindLM pricing

> ${PRICING_PAGE.lede}

Full page: ${canonicalUrl(SEO_BASE_URL, PRICING_PATH)}

## Prices

| Plan | Price | Billing |
| --- | --- | --- |
${rows}

${PRICING_PAGE.currencyNote}

${plans}

## Billing questions

${faqs}
`;
}
