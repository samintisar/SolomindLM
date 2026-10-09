import { PLANS } from "@/features/landing/components/home/landingHomeContent";
import { getBillingFaqs } from "@/features/landing/faqRegistry";
import { getPricingRows, PRICING_PAGE, PRICING_PATH } from "@/features/landing/pricingPageContent";
import { SEO_BASE_URL } from "./seoConstants";
import { canonicalUrl } from "./seoHtml";

/**
 * pricing.md: a plain-text pricing summary for AI crawlers and agents. scripts/generate-pricing-md.ts
 * writes it to public/ and dist/ at build time from the same data as the /pricing page.
 */
export function buildPricingMarkdown(): string {
  const rows = getPricingRows()
    .map((row) => `| ${row.plan} | ${row.price} | ${row.billing} |`)
    .join("\n");

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

Prices in US dollars.

${plans}

## Billing questions

${faqs}
`;
}
