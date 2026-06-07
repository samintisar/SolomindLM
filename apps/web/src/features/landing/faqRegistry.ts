import { CLUSTER_HUB_PAGES } from "./clusterHubPages";
import type { FAQItem } from "./constants";
import { INTENT_LANDING_PAGES } from "./intentLandingPages";

export type FaqCategoryId =
  | "getting-started"
  | "students"
  | "researchers"
  | "billing"
  | "privacy-trust";

export type RegisteredFaq = FAQItem & {
  category: FaqCategoryId;
  learnMorePath?: string;
  learnMoreLabel?: string;
};

export type FaqCategory = {
  id: FaqCategoryId;
  title: string;
  description: string;
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Accounts, notebooks, sources, and how SolomindLM fits your workflow.",
  },
  {
    id: "students",
    title: "Students & study tools",
    description: "Flashcards, quizzes, audio, mind maps, and other Studio outputs.",
  },
  {
    id: "researchers",
    title: "Researchers",
    description: "Paper discovery, imports, citations, literature review, and deep research.",
  },
  {
    id: "billing",
    title: "Billing & plans",
    description: "Free vs Pro, notebook limits, and daily generation caps.",
  },
  {
    id: "privacy-trust",
    title: "Privacy & trust",
    description: "Data use, AI accuracy, and when to verify outputs yourself.",
  },
];

/** Cross-cutting FAQs shown on the homepage and categorized on /faq. */
const CORE_GENERAL_FAQS: RegisteredFaq[] = [
  {
    category: "privacy-trust",
    question: "How accurate is the AI-generated content?",
    answer:
      "Generated content is based on the sources you add, but it should still be reviewed against the original material before you rely on it for studying or research.",
  },
  {
    category: "getting-started",
    question: "What languages are supported?",
    answer: "SolomindLM is currently focused on English-language study and research workflows.",
  },
  {
    category: "students",
    question: "What can I do with generated study materials?",
    answer:
      "You can create study outputs like flashcards, quizzes, mind maps, and audio overviews from your sources, then review them inside SolomindLM.",
    learnMorePath: "/students",
    learnMoreLabel: "Explore student study tools",
  },
  {
    category: "privacy-trust",
    question: "How is my data used and protected?",
    answer:
      "Your content is used to run the product you see—search, chat, and generation—and is handled as described in our Privacy Policy. We use trusted infrastructure and AI providers as subprocessors; we don't sell your personal information. The policy also covers analytics and email-based sign-in.",
    learnMorePath: "/privacy",
    learnMoreLabel: "Read privacy policy",
  },
  {
    category: "billing",
    question: "Is there a limit on how much I can upload?",
    answer:
      "The free plan includes 20 notebooks per account with up to 200 sources per notebook. Pro plans offer 200 notebooks per account with up to 200 sources per notebook. Each plan also includes daily limits on AI-generated content. Check our pricing section for details.",
    learnMorePath: "/#pricing",
    learnMoreLabel: "See pricing",
  },
  {
    category: "students",
    question: "What makes SolomindLM different from Quizlet or Anki?",
    answer:
      "SolomindLM starts from your PDFs, videos, articles, and notes, then helps generate study materials from that source content instead of requiring you to create everything manually.",
  },
  {
    category: "getting-started",
    question: "How long does it take to generate study materials?",
    answer:
      "Processing time depends on the source length, file type, and the output you choose to generate.",
  },
];

/** Question text for the curated homepage FAQ subset (order preserved). */
const HOMEPAGE_FAQ_QUESTIONS: string[] = [
  "How accurate is the AI-generated content?",
  "What languages are supported?",
  "What can I do with generated study materials?",
  "How is my data used and protected?",
  "Is there a limit on how much I can upload?",
  "What makes SolomindLM different from Quizlet or Anki?",
  "How long does it take to generate study materials?",
  "Do I need to upload sources before generating study materials?",
  "Is literature review mode a systematic review tool?",
  "Is there a free plan for students?",
];

const HUB_FAQ_CATEGORY: Record<string, FaqCategoryId> = {
  "/students": "getting-started",
  "/research": "researchers",
};

function hubFaqCategory(hubPath: string, question: string): FaqCategoryId {
  if (hubPath === "/students") {
    if (question === "Is there a free plan for students?") return "billing";
    if (question === "How is the Quiz tool different from Written Questions?") return "students";
  }
  if (hubPath === "/research") {
    if (question === "Should I trust AI answers without checking the PDFs?") return "privacy-trust";
  }
  return HUB_FAQ_CATEGORY[hubPath] ?? "getting-started";
}

function hubLearnMoreLabel(hubPath: string): string {
  if (hubPath === "/students") return "Explore student study tools";
  if (hubPath === "/research") return "Explore research tools";
  return "Learn more";
}

function collectRegisteredFaqs(): RegisteredFaq[] {
  const byQuestion = new Map<string, RegisteredFaq>();

  const upsert = (faq: RegisteredFaq, options?: { overrideLearnMore?: boolean }) => {
    const existing = byQuestion.get(faq.question);
    if (!existing) {
      byQuestion.set(faq.question, faq);
      return;
    }

    const learnMore =
      options?.overrideLearnMore && faq.learnMorePath
        ? { learnMorePath: faq.learnMorePath, learnMoreLabel: faq.learnMoreLabel }
        : {
            learnMorePath: existing.learnMorePath ?? faq.learnMorePath,
            learnMoreLabel: existing.learnMoreLabel ?? faq.learnMoreLabel,
          };

    byQuestion.set(faq.question, {
      ...existing,
      category: existing.category,
      ...learnMore,
    });
  };

  for (const faq of CORE_GENERAL_FAQS) {
    upsert(faq);
  }

  for (const hub of CLUSTER_HUB_PAGES) {
    for (const faq of hub.faqs) {
      upsert(
        {
          ...faq,
          category: hubFaqCategory(hub.path, faq.question),
          learnMorePath: hub.path,
          learnMoreLabel: hubLearnMoreLabel(hub.path),
        },
        { overrideLearnMore: true }
      );
    }
  }

  for (const page of INTENT_LANDING_PAGES) {
    const category: FaqCategoryId = page.cluster === "students" ? "students" : "researchers";
    for (const faq of page.faqs) {
      upsert(
        {
          ...faq,
          category,
          learnMorePath: page.path,
          learnMoreLabel: `See ${page.navLabel}`,
        },
        { overrideLearnMore: true }
      );
    }
  }

  return [...byQuestion.values()];
}

function sortFaqsForCategory(faqs: RegisteredFaq[]): RegisteredFaq[] {
  return faqs.toSorted((a, b) => a.question.localeCompare(b.question));
}

/** All unique FAQs grouped for the /faq page. */
export function getFaqCategoriesWithItems(): Array<FaqCategory & { faqs: RegisteredFaq[] }> {
  const allFaqs = collectRegisteredFaqs();
  return FAQ_CATEGORIES.map((category) => ({
    ...category,
    faqs: sortFaqsForCategory(allFaqs.filter((faq) => faq.category === category.id)),
  })).filter((category) => category.faqs.length > 0);
}

/** Flat list of all unique FAQs (for SEO structured data on /faq). */
export function getAllFaqs(): FAQItem[] {
  return collectRegisteredFaqs().map(({ question, answer }) => ({ question, answer }));
}

/** Curated subset for the homepage FAQ section (~10 items). */
export function getHomepageFaqs(): FAQItem[] {
  const byQuestion = new Map(collectRegisteredFaqs().map((faq) => [faq.question, faq]));

  return HOMEPAGE_FAQ_QUESTIONS.flatMap((question) => {
    const faq = byQuestion.get(question);
    return faq ? [{ question: faq.question, answer: faq.answer }] : [];
  });
}

/** @deprecated Import from faqRegistry — kept as alias for gradual migration. */
export const LANDING_FAQS: FAQItem[] = getHomepageFaqs();
