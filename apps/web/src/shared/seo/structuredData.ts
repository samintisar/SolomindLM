const BASE_URL = "https://solomindlm.com";
const DEFAULT_DESCRIPTION =
  "Intelligent knowledge management for researchers and learners. Transform documents into structured insights, flashcards, quizzes, and research summaries with grounded AI.";

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
  url: BASE_URL,
  logo: `${BASE_URL}/SolomindLM_logo.png`,
  description: DEFAULT_DESCRIPTION,
  sameAs: ["https://github.com/solomindlm", "https://x.com/SolomindLM"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "support@solomindlm.com",
  },
});

export const generateWebSiteStructuredData = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SolomindLM",
  url: BASE_URL,
  description: DEFAULT_DESCRIPTION,
  potentialAction: {
    "@type": "SearchAction",
    target: `${BASE_URL}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
});

export const generateSoftwareApplicationStructuredData = () => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SolomindLM",
  applicationCategory: "https://schema.org/ResearchTool",
  url: BASE_URL,
  description: DEFAULT_DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
});
