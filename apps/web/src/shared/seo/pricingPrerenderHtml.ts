import { PLANS } from "@/features/landing/components/home/landingHomeContent";
import { getBillingFaqs } from "@/features/landing/faqRegistry";
import { getPricingRows, PRICING_PAGE } from "@/features/landing/pricingPageContent";
import { escapeHtml } from "./seoHtml";

/** Static HTML body for /pricing — every plan, price, billing period and limit as plain text. */
export function buildPricingPrerenderBody(): string {
  const breadcrumbItems = PRICING_PAGE.breadcrumbs;
  const breadcrumbNav = breadcrumbItems
    .map((item, index) =>
      index === breadcrumbItems.length - 1
        ? `          <li>${escapeHtml(item.name)}</li>`
        : `          <li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a></li>`
    )
    .join("\n");

  const priceRows = getPricingRows()
    .map(
      (row) =>
        `            <tr><th scope="row">${escapeHtml(row.plan)}</th><td>${escapeHtml(row.price)}</td><td>${escapeHtml(row.billing)}</td></tr>`
    )
    .join("\n");

  const planSections = PLANS.map(
    (plan) => `        <section>
          <h3>${escapeHtml(plan.name)}</h3>
          <p>${escapeHtml(plan.description)}</p>
          <ul>
${plan.features.map((feature) => `            <li>${escapeHtml(feature)}</li>`).join("\n")}
          </ul>
        </section>`
  ).join("\n");

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
      <section aria-labelledby="seo-prerender-prices">
        <h2 id="seo-prerender-prices">${escapeHtml(PRICING_PAGE.tableTitle)}</h2>
        <table>
          <thead>
            <tr><th scope="col">Plan</th><th scope="col">Price</th><th scope="col">Billing</th></tr>
          </thead>
          <tbody>
${priceRows}
          </tbody>
        </table>
        <p>Prices in US dollars.</p>
      </section>
      <section aria-labelledby="seo-prerender-limits">
        <h2 id="seo-prerender-limits">${escapeHtml(PRICING_PAGE.limitsTitle)}</h2>
${planSections}
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
