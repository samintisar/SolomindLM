import { describe, expect, it } from "vitest";
import { LANDING_FAQS } from "@/features/landing/faqRegistry";
import {
  getIntentBreadcrumbItems,
  getIntentLandingPageByPath,
} from "@/features/landing/intentLandingPages";
import { generateBreadcrumbStructuredData, generateFAQStructuredData } from "./structuredData";

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
