import { PRO_PRICE_USD, PRO_YEARLY_PER_MONTH_USD } from "@/features/billing/planPricing";
import { SEO_BASE_URL, SEO_DEFAULT_DESCRIPTION, SEO_DEFAULT_OG_IMAGE } from "./seoConstants";

/** schema.org prices are plain decimals: 0 → "0", 15 → "15", 7.5 → "7.50". */
function schemaPrice(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export const generateFAQStructuredData = (faqs: Array<{ question: string; answer: string }>) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
});

export const generateOrganizationStructuredData = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "SolomindLM",
  url: SEO_BASE_URL,
  logo: SEO_DEFAULT_OG_IMAGE,
  description: SEO_DEFAULT_DESCRIPTION,
  sameAs: ["https://github.com/samintisar/SolomindLM", "https://twitter.com/solomindlm"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "support@solomindlm.com",
  },
});

/** WebSite schema without SearchAction until a public /search route exists. */
export const generateWebSiteStructuredData = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SolomindLM",
  url: SEO_BASE_URL,
  description: SEO_DEFAULT_DESCRIPTION,
});

export const generateSoftwareApplicationStructuredData = () => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SolomindLM",
  applicationCategory: "https://schema.org/ResearchTool",
  url: SEO_BASE_URL,
  description: SEO_DEFAULT_DESCRIPTION,
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
    },
    // Each offer states the amount charged per billing period (UN/CEFACT ANN = year, MON = month).
    {
      "@type": "Offer",
      name: "Pro (annual billing)",
      description: `Billed $${schemaPrice(PRO_PRICE_USD.yearly)} once a year, equivalent to $${schemaPrice(PRO_YEARLY_PER_MONTH_USD)}/month.`,
      price: schemaPrice(PRO_PRICE_USD.yearly),
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: schemaPrice(PRO_PRICE_USD.yearly),
        priceCurrency: "USD",
        billingDuration: 1,
        unitCode: "ANN",
      },
    },
    {
      "@type": "Offer",
      name: "Pro (monthly billing)",
      price: schemaPrice(PRO_PRICE_USD.monthly),
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: schemaPrice(PRO_PRICE_USD.monthly),
        priceCurrency: "USD",
        billingDuration: 1,
        unitCode: "MON",
      },
    },
  ],
});

export type BreadcrumbItem = {
  name: string;
  path: string;
};

export type ArticleStructuredDataParams = {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified: string;
  articleType?: "Article" | "TechArticle";
};

export const generateArticleStructuredData = ({
  headline,
  description,
  path,
  datePublished,
  dateModified,
  articleType = "Article",
}: ArticleStructuredDataParams) => ({
  "@context": "https://schema.org",
  "@type": articleType,
  headline,
  description,
  url: `${SEO_BASE_URL}${path}`,
  datePublished,
  dateModified,
  author: {
    "@type": "Organization",
    name: "SolomindLM",
    url: SEO_BASE_URL,
  },
  publisher: {
    "@type": "Organization",
    name: "SolomindLM",
    logo: {
      "@type": "ImageObject",
      url: SEO_DEFAULT_OG_IMAGE,
    },
  },
  mainEntityOfPage: `${SEO_BASE_URL}${path}`,
});

export const generateBreadcrumbStructuredData = (items: BreadcrumbItem[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: `${SEO_BASE_URL}${item.path === "/" ? "" : item.path}`,
  })),
});

export const generateWebApplicationStructuredData = (args: {
  name: string;
  description: string;
  path: string;
}) => ({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: args.name,
  description: args.description,
  url: `${SEO_BASE_URL}${args.path}`,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any (web browser)",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  provider: { "@type": "Organization", name: "SolomindLM", url: SEO_BASE_URL },
});

export const generateHowToStructuredData = (args: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
}) => ({
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: args.name,
  description: args.description,
  step: args.steps.map((step, index) => ({
    "@type": "HowToStep",
    position: index + 1,
    name: step.name,
    text: step.text,
  })),
});
