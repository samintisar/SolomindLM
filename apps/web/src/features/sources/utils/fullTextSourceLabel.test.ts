import { describe, expect, it } from "vitest";
import { fullTextSourceLabel } from "./fullTextSourceLabel";

describe("fullTextSourceLabel", () => {
  it("names the version and licence", () => {
    expect(
      fullTextSourceLabel({ method: "oa_pdf", version: "acceptedVersion", license: "cc-by" })
    ).toBe("Accepted manuscript · CC BY");
    expect(
      fullTextSourceLabel({ method: "oa_pdf", version: "publishedVersion", license: "cc-by-nc-nd" })
    ).toBe("Published version · CC BY-NC-ND");
  });

  it("names a preprint, an uploaded PDF and a scraped page", () => {
    expect(
      fullTextSourceLabel({ method: "oa_pdf", version: "submittedVersion", host: "arxiv.org" })
    ).toBe("Preprint · arxiv.org");
    expect(fullTextSourceLabel({ method: "uploaded_pdf" })).toBe("PDF you uploaded");
    expect(fullTextSourceLabel({ method: "landing_page", host: "elifesciences.org" })).toBe(
      "Publisher page · elifesciences.org"
    );
  });

  it("is undefined with nothing to say", () => {
    expect(fullTextSourceLabel(undefined)).toBeUndefined();
  });

  it("labels licences", () => {
    const label = (license: string) =>
      fullTextSourceLabel({ method: "oa_pdf", version: "publishedVersion", license });
    expect(label("cc0")).toBe("Published version · CC0");
    expect(label("cc-by-sa")).toBe("Published version · CC BY-SA");
    expect(label("publisher-specific-oa")).toBe("Published version · Publisher licence");
    expect(label("implied-oa")).toBe("Published version · Open access");
    expect(label("other-oa")).toBe("Published version · Open licence");
    expect(label("some-new-licence")).toBe("Published version · some-new-licence");
  });
});
