import { PRO_YEARLY_SAVINGS_PERCENT } from "@/features/billing/planPricing";
import {
  BILLING_LABELS,
  type Billing,
  PLANS,
  type Plan,
  PRICING_HEADLINE,
} from "@/features/landing/components/home/landingHomeContent";
import { getBillingFaqs } from "@/features/landing/faqRegistry";
import { PRICING_PAGE } from "@/features/landing/pricingPageContent";
import { escapeHtml } from "./seoHtml";

const BILLING_PERIODS = Object.keys(BILLING_LABELS) as Billing[];

function priceText(plan: Plan, billing: Billing): string {
  return `<strong>${escapeHtml(plan.price[billing])}</strong> ${escapeHtml(plan.period[billing])}`;
}

/**
 * A plan card as text: its price under each billing tab (one line when the tabs agree, as for
 * Free), its description and its limits.
 */
function planCardHtml(plan: Plan): string {
  const samePrice = BILLING_PERIODS.every(
    (billing) =>
      plan.price[billing] === plan.price.annual && plan.period[billing] === plan.period.annual
  );
  const priceLines = BILLING_PERIODS.map((billing) => {
    const savings = billing === "annual" ? ` (save ${PRO_YEARLY_SAVINGS_PERCENT}%)` : "";
    return `            <li>${escapeHtml(BILLING_LABELS[billing])}: ${priceText(plan, billing)}${savings}</li>`;
  }).join("\n");
  const prices = samePrice
    ? `          <p>${priceText(plan, "annual")}</p>`
    : `          <ul>\n${priceLines}\n          </ul>`;
  const features = plan.features
    .map((feature) => `            <li>${escapeHtml(feature)}</li>`)
    .join("\n");

  return `        <section>
          <h3>${escapeHtml(plan.name)}</h3>
${prices}
          <p>${escapeHtml(plan.description)}</p>
          <ul>
${features}
          </ul>
        </section>`;
}

/** Static HTML body for /pricing: the plan cards (every price, billing period and limit) as text. */
export function buildPricingPrerenderBody(): string {
  const breadcrumbItems = PRICING_PAGE.breadcrumbs;
  const breadcrumbNav = breadcrumbItems
    .map((item, index) =>
      index === breadcrumbItems.length - 1
        ? `          <li>${escapeHtml(item.name)}</li>`
        : `          <li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a></li>`
    )
    .join("\n");

  const faqItems = getBillingFaqs()
    .map(
      (faq) =>
        `        <div>\n          <h3>${escapeHtml(faq.question)}</h3>\n          <p>${escapeHtml(faq.answer)}</p>\n        </div>`
    )
    .join("\n");

  return `    <main>\n      <article data-seo-prerender="true" id="seo-prerender-content">
      <nav aria-label="Breadcrumb">
        <ol>
${breadcrumbNav}
        </ol>
      </nav>
      <header>
        <h1>${escapeHtml(PRICING_PAGE.h1)}</h1>
        <p>${escapeHtml(PRICING_PAGE.lede)}</p>
      </header>
      <section aria-labelledby="seo-prerender-plans">
        <p>Pricing</p>
        <h2 id="seo-prerender-plans">${escapeHtml(`${PRICING_HEADLINE.lead} ${PRICING_HEADLINE.accent}`)}</h2>
${PLANS.map(planCardHtml).join("\n")}
        <p>${escapeHtml(PRICING_PAGE.currencyNote)}</p>
      </section>
      <section aria-labelledby="seo-prerender-faq">
        <h2 id="seo-prerender-faq">Frequently asked questions</h2>
${faqItems}
      </section>
      <section>
        <h2>${escapeHtml(PRICING_PAGE.closing.body)}</h2>
        <p>${escapeHtml(PRICING_PAGE.closing.ctaLabel)}</p>
      </section>
      <footer>
        <p><a href="/">SolomindLM home</a> · <a href="/faq">FAQ</a> · <a href="/terms">Terms of Service</a></p>
      </footer>
      </article>\n    </main>`;
}
