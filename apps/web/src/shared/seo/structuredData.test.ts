import { describe, expect, it } from "vitest";
import { LANDING_FAQS } from "@/features/landing/constants";
import { generateFAQStructuredData } from "./structuredData";

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
