import { describe, expect, it } from "vitest";
import {
  FAQ_CATEGORIES,
  getAllFaqs,
  getFaqCategoriesWithItems,
  getHomepageFaqs,
  LANDING_FAQS,
} from "./faqRegistry";

describe("faqRegistry", () => {
  it("deduplicates FAQs by question text", () => {
    const all = getAllFaqs();
    const questions = all.map((faq) => faq.question);
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("includes FAQs from intent and hub pages", () => {
    const all = getAllFaqs();
    expect(all.length).toBeGreaterThan(50);
    expect(all.some((faq) => faq.question.includes("flashcards"))).toBe(true);
    expect(all.some((faq) => faq.question.includes("citation"))).toBe(true);
  });

  it("groups every FAQ into a non-empty category", () => {
    const categorized = getFaqCategoriesWithItems();
    const categorizedCount = categorized.reduce((sum, cat) => sum + cat.faqs.length, 0);
    expect(categorizedCount).toBe(getAllFaqs().length);
    for (const category of categorized) {
      expect(category.faqs.length).toBeGreaterThan(0);
      expect(FAQ_CATEGORIES.some((meta) => meta.id === category.id)).toBe(true);
    }
  });

  it("returns a curated homepage subset with expected extras", () => {
    const homepage = getHomepageFaqs();
    expect(homepage).toHaveLength(10);
    expect(homepage.map((faq) => faq.question)).toContain(
      "Do I need to upload sources before generating study materials?"
    );
    expect(homepage.map((faq) => faq.question)).toContain(
      "Is literature review mode a systematic review tool?"
    );
    expect(homepage.map((faq) => faq.question)).toContain("Is there a free plan for students?");
  });

  it("exports LANDING_FAQS as the homepage subset", () => {
    expect(LANDING_FAQS).toEqual(getHomepageFaqs());
  });

  it("prefers intent-page learn-more links over hub pages for duplicate questions", () => {
    const categorized = getFaqCategoriesWithItems();
    const researchers = categorized.find((cat) => cat.id === "researchers");
    const citationFaq = researchers?.faqs.find(
      (faq) => faq.question === "Which citation styles are supported?"
    );

    expect(citationFaq?.learnMorePath).toBe("/research/citation-styles");
    expect(citationFaq?.learnMoreLabel).toBe("See Citation Styles");
  });

  it("adds descriptive learn-more labels for hub and policy links", () => {
    const categorized = getFaqCategoriesWithItems();
    const all = categorized.flatMap((cat) => cat.faqs);
    const privacyFaq = all.find((faq) => faq.question === "How is my data used and protected?");
    const uploadLimitFaq = all.find(
      (faq) => faq.question === "Is there a limit on how much I can upload?"
    );

    expect(privacyFaq?.learnMoreLabel).toBe("Read privacy policy");
    expect(privacyFaq?.learnMorePath).toBe("/privacy");
    expect(uploadLimitFaq?.learnMoreLabel).toBe("See pricing");
    expect(uploadLimitFaq?.learnMorePath).toBe("/#pricing");
  });
});
