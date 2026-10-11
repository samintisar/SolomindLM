import { describe, expect, it } from "vitest";
import { PRO_PRICE_USD, PRO_YEARLY_PER_MONTH_USD } from "@/features/billing/planPricing";
import { LANDING_FAQS } from "@/features/landing/faqRegistry";
import {
  getIntentBreadcrumbItems,
  getIntentLandingPageByPath,
} from "@/features/landing/intentLandingPages";
import {
  getSeoContentBreadcrumbItems,
  getSeoContentPageByPath,
} from "@/features/landing/seoContentPages";
import {
  generateArticleStructuredData,
  generateBreadcrumbStructuredData,
  generateFAQStructuredData,
  generateSoftwareApplicationStructuredData,
} from "./structuredData";

describe("generateFAQStructuredData", () => {
  it("returns a single FAQPage with all questions in mainEntity", () => {
    const data = generateFAQStructuredData(LANDING_FAQS);

    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(LANDING_FAQS.length);
    expect(data.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: LANDING_FAQS[0]!.question,
    });
    expect(data.mainEntity.at(-1)).toMatchObject({
      "@type": "Question",
      name: LANDING_FAQS.at(-1)!.question,
    });
    expect(data).not.toHaveProperty("dateModified");
  });

  it("carries dateModified when the page gives one", () => {
    const data = generateFAQStructuredData(LANDING_FAQS, { dateModified: "2026-10-07" });
    expect(data).toMatchObject({ "@type": "FAQPage", dateModified: "2026-10-07" });
  });
});

describe("generateBreadcrumbStructuredData", () => {
  it("returns BreadcrumbList with absolute URLs for intent pages", () => {
    const page = getIntentLandingPageByPath("/students/ai-flashcards");
    expect(page).toBeDefined();

    const data = generateBreadcrumbStructuredData(getIntentBreadcrumbItems(page!));

    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://www.solomindlm.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Students",
        item: "https://www.solomindlm.com/students",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Flashcards",
        item: "https://www.solomindlm.com/students/ai-flashcards",
      },
    ]);
  });
});

describe("generateSoftwareApplicationStructuredData", () => {
  it("returns a Free offer and two Pro offers with schema.org-valid billing periods", () => {
    const data = generateSoftwareApplicationStructuredData();

    expect(data["@type"]).toBe("SoftwareApplication");
    expect(data.offers).toHaveLength(3);
    // Prices come from billing/planPricing.ts, the same source as the pricing cards.
    // Each offer states what is actually charged per billing period.
    expect(data.offers.map((offer) => offer.price)).toEqual([
      "0",
      String(PRO_PRICE_USD.yearly),
      String(PRO_PRICE_USD.monthly),
    ]);
    expect(data.offers[0]).toMatchObject({
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
    });
    const [, annual, monthly] = data.offers;
    expect(annual.priceSpecification).toMatchObject({
      "@type": "UnitPriceSpecification",
      price: String(PRO_PRICE_USD.yearly),
      priceCurrency: "USD",
      billingDuration: 1,
      unitCode: "ANN",
    });
    // The per-month figure the cards lead with is kept, labeled as an equivalent.
    expect(annual.description).toContain(`$${PRO_YEARLY_PER_MONTH_USD.toFixed(2)}/month`);
    expect(monthly.priceSpecification).toMatchObject({
      "@type": "UnitPriceSpecification",
      price: String(PRO_PRICE_USD.monthly),
      priceCurrency: "USD",
      billingDuration: 1,
      unitCode: "MON",
    });
    for (const offer of data.offers.slice(1)) {
      expect(offer).toMatchObject({ "@type": "Offer", priceCurrency: "USD" });
      // "billingDurationUnit" is not a schema.org property and would be silently
      // ignored by structured-data consumers — guard against reintroducing it.
      expect(offer.priceSpecification).not.toHaveProperty("billingDurationUnit");
    }
  });
});

describe("generateArticleStructuredData", () => {
  it("returns TechArticle with canonical URL for SEO content pages", () => {
    const page = getSeoContentPageByPath("/guides/how-to-study-from-pdfs-with-ai");
    expect(page).toBeDefined();

    const data = generateArticleStructuredData({
      headline: page!.h1,
      description: page!.description,
      path: page!.path,
      datePublished: "2026-06-07",
      dateModified: "2026-06-07",
      articleType: page!.articleType,
    });

    expect(data["@type"]).toBe("TechArticle");
    expect(data.url).toBe("https://www.solomindlm.com/guides/how-to-study-from-pdfs-with-ai");
    expect(data.headline).toBe(page!.h1);
  });

  it("returns BreadcrumbList for SEO content guide pages", () => {
    const page = getSeoContentPageByPath("/guides/how-to-do-an-ai-literature-review");
    expect(page).toBeDefined();

    const data = generateBreadcrumbStructuredData(getSeoContentBreadcrumbItems(page!));

    expect(data.itemListElement).toHaveLength(3);
    expect(data.itemListElement[1]).toMatchObject({
      name: "Guides",
      item: "https://www.solomindlm.com/guides/how-to-study-from-pdfs-with-ai",
    });
  });
});
