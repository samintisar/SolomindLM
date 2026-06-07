import { SEO_BASE_URL, SEO_DEFAULT_DESCRIPTION, SEO_DEFAULT_OG_IMAGE } from "./seoConstants";

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
  sameAs: ["https://github.com/solomindlm", "https://twitter.com/solomindlm"],
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
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
});

export type BreadcrumbItem = {
  name: string;
  path: string;
};

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
