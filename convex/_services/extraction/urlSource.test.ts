import { describe, expect, it, vi } from "vitest";
import { UserFacingSourceError } from "../../_lib/sourceFailure";
import { extractUrlSource, pdfUrlForLink } from "./urlSource";

describe("pdfUrlForLink", () => {
  it.each([
    ["https://arxiv.org/pdf/2310.11511", "https://arxiv.org/pdf/2310.11511"],
    ["https://arxiv.org/pdf/2310.11511v2", "https://arxiv.org/pdf/2310.11511v2"],
    ["https://arxiv.org/pdf/2310.11511.pdf", "https://arxiv.org/pdf/2310.11511.pdf"],
    ["https://arxiv.org/abs/2310.11511", "https://arxiv.org/pdf/2310.11511"],
    ["https://arxiv.org/abs/2310.11511v3", "https://arxiv.org/pdf/2310.11511v3"],
    ["http://www.arxiv.org/abs/hep-th/9711200", "https://arxiv.org/pdf/hep-th/9711200"],
    ["https://export.arxiv.org/abs/2005.11401", "https://arxiv.org/pdf/2005.11401"],
    ["https://example.org/papers/report.pdf", "https://example.org/papers/report.pdf"],
    ["https://example.org/report.PDF?download=1", "https://example.org/report.PDF?download=1"],
  ])("%s -> %s", (link, expected) => {
    expect(pdfUrlForLink(link)).toBe(expected);
  });

  it.each([
    "https://arxiv.org/list/cs.CL/recent",
    "https://example.org/pdf-guide",
    "https://example.org/blog/post",
    "not a url",
  ])("leaves %s to the web scraper", (link) => {
    expect(pdfUrlForLink(link)).toBeUndefined();
  });
});

const OCR_TEXT =
  "**Page 1**\n\narXiv:2310.11511v1 [cs.CL]\n\n# Self-RAG: Learning to Retrieve\n\nBody text.";

function deps(overrides: Partial<Parameters<typeof extractUrlSource>[1]> = {}) {
  return {
    scrape: vi.fn(async () => ({ title: "A page", content: "Plain page text." })),
    ocrPdf: vi.fn(async () => OCR_TEXT),
    ...overrides,
  };
}

describe("extractUrlSource", () => {
  it("reads an arXiv abstract link as the paper's PDF, titled from its first heading", async () => {
    const d = deps();

    const result = await extractUrlSource("https://arxiv.org/abs/2310.11511", d);

    expect(d.ocrPdf).toHaveBeenCalledWith("https://arxiv.org/pdf/2310.11511");
    expect(d.scrape).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: OCR_TEXT,
      title: "Self-RAG: Learning to Retrieve",
      method: "pdf_ocr",
    });
  });

  it("scrapes ordinary web pages", async () => {
    const d = deps();

    const result = await extractUrlSource("https://example.org/blog/post", d);

    expect(d.ocrPdf).not.toHaveBeenCalled();
    expect(result).toEqual({ content: "Plain page text.", title: "A page", method: "web_scrape" });
  });

  it("reads a link as a PDF when the scrape comes back as PDF bytes", async () => {
    const d = deps({
      scrape: vi.fn(async () => ({ title: "", content: "%PDF-1.5 %�� 203 0 obj" })),
    });

    const result = await extractUrlSource("https://journal.example/article/42/download", d);

    expect(d.ocrPdf).toHaveBeenCalledWith("https://journal.example/article/42/download");
    expect(result.method).toBe("pdf_ocr");
  });

  it("refuses other binary files instead of storing them as text", async () => {
    const d = deps({
      scrape: vi.fn(async () => ({ title: "", content: "PK\u0003\u0004".concat("�".repeat(500)) })),
    });

    await expect(extractUrlSource("https://example.org/file", d)).rejects.toBeInstanceOf(
      UserFacingSourceError
    );
  });

  it("says the PDF could not be read, keeping the cause for logs and retry classification", async () => {
    const d = deps({
      ocrPdf: vi.fn(async () => {
        throw new Error("mistral HTTP 429: rate limited");
      }),
    });

    const err = await extractUrlSource("https://arxiv.org/pdf/2310.11511", d).catch((e) => e);

    expect(err).toBeInstanceOf(UserFacingSourceError);
    expect(err.userMessage).toMatch(/couldn't read the PDF/i);
    expect(err.message).toContain("429");
  });

  it("treats an empty OCR result as unreadable", async () => {
    const d = deps({ ocrPdf: vi.fn(async () => "   ") });

    await expect(extractUrlSource("https://example.org/a.pdf", d)).rejects.toBeInstanceOf(
      UserFacingSourceError
    );
  });
});
