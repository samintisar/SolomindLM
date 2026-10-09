import { describe, expect, it } from "vitest";
import {
  formatUsd,
  PRO_PRICE_USD,
  PRO_YEARLY_PER_MONTH_USD,
  PRO_YEARLY_SAVINGS_PERCENT,
} from "@/features/billing/planPricing";
import { PLANS } from "@/features/landing/components/home/landingHomeContent";
import { getBillingFaqs } from "@/features/landing/faqRegistry";
import { PRICING_PAGE, PRICING_PATH } from "@/features/landing/pricingPageContent";
import { buildPricingPrerenderBody } from "./pricingPrerenderHtml";
import { getIndexablePublicSeoPages, getPublicSeoPageByPath } from "./publicSeoPages";
import { buildPublicSeoPrerenderBody } from "./publicSeoPrerenderHtml";
import { SEO_BASE_URL } from "./seoConstants";
import { applySeoToHtml, escapeHtml, seoPageToHeadInput } from "./seoHtml";

const MINIMAL_HTML = `<!doctype html><html><head><title>Old</title></head><body><div id="root"></div></body></html>`;

describe("/pricing prerendered body", () => {
  const body = buildPricingPrerenderBody();

  it("shows every price on the plan cards, with its billing period", () => {
    for (const price of [
      formatUsd(0),
      formatUsd(PRO_YEARLY_PER_MONTH_USD),
      formatUsd(PRO_PRICE_USD.monthly),
    ]) {
      expect(body).toContain(`<strong>${price}</strong>`);
    }
    expect(body).toContain(
      `<li>Annual: <strong>${formatUsd(PRO_YEARLY_PER_MONTH_USD)}</strong> / month, billed yearly (save ${PRO_YEARLY_SAVINGS_PERCENT}%)</li>`
    );
    expect(body).toContain(
      `<li>Monthly: <strong>${formatUsd(PRO_PRICE_USD.monthly)}</strong> / month</li>`
    );
    // Free costs the same under both tabs, so it gets one line.
    expect(body).toContain(`<p><strong>${formatUsd(0)}</strong> forever</p>`);
    expect(body).toContain(`<p>${PRICING_PAGE.currencyNote}</p>`);
  });

  it("mirrors each plan card: name, description and every limit", () => {
    for (const plan of PLANS) {
      expect(body).toContain(`<h3>${escapeHtml(plan.name)}</h3>`);
      expect(body).toContain(`<p>${escapeHtml(plan.description)}</p>`);
      for (const feature of plan.features) {
        expect(body).toContain(`<li>${escapeHtml(feature)}</li>`);
      }
    }
  });

  it("has no separate price table or limits section (the cards carry both)", () => {
    expect(body).not.toContain("<table>");
    expect(body.match(/<h2/g)).toHaveLength(3);
  });

  it("has one h1, a breadcrumb and the billing FAQ", () => {
    expect(body.match(/<h1>/g)).toHaveLength(1);
    expect(body).toContain(`<h1>${escapeHtml(PRICING_PAGE.h1)}</h1>`);
    expect(body).toContain('aria-label="Breadcrumb"');
    for (const faq of getBillingFaqs()) {
      expect(body).toContain(escapeHtml(faq.answer));
    }
  });

  it("is what the prerender script injects for /pricing, pinned light", () => {
    const injected = buildPublicSeoPrerenderBody(PRICING_PATH);
    expect(injected).toContain(body);
    expect(injected).toContain("auth-form-light");
  });
});

describe("/pricing SEO registry entry", () => {
  const page = getPublicSeoPageByPath(PRICING_PATH);

  it("is indexable, so the sitemap and prerender pick it up", () => {
    expect(page).toBeDefined();
    expect(getIndexablePublicSeoPages().map((p) => p.path)).toContain(PRICING_PATH);
  });

  it("has its own title, description and canonical", () => {
    const html = applySeoToHtml(MINIMAL_HTML, SEO_BASE_URL, seoPageToHeadInput(page!));
    expect(html).toContain(`<title>${escapeHtml(PRICING_PAGE.title)}</title>`);
    expect(html).toContain(`rel="canonical" href="${SEO_BASE_URL}/pricing"`);
    expect(html).toContain('name="robots" content="index, follow"');
    expect(PRICING_PAGE.description).toContain(formatUsd(PRO_YEARLY_PER_MONTH_USD));
    expect(PRICING_PAGE.description).toContain(formatUsd(PRO_PRICE_USD.monthly));
  });

  it("carries BreadcrumbList, SoftwareApplication offers and FAQPage JSON-LD", () => {
    const nodes = page!.structuredData as Record<string, unknown>[];
    expect(nodes.map((node) => node["@type"])).toEqual([
      "BreadcrumbList",
      "SoftwareApplication",
      "FAQPage",
    ]);
    const app = nodes[1] as { offers: { price: string }[] };
    expect(app.offers.map((offer) => offer.price)).toEqual([
      "0",
      PRO_YEARLY_PER_MONTH_USD.toFixed(2),
      String(PRO_PRICE_USD.monthly),
    ]);
  });
});
