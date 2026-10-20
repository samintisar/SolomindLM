import { describe, expect, it, vi } from "vitest";
import { ExternalServiceError } from "../_lib/errors";
import type { OaCandidate } from "../_services/extraction/openAccess/OpenAccessResolver";
import {
  fulltextStatusAfterIngest,
  HTML_ATTEMPT_RESERVE_MS,
  INGEST_DEADLINE_MS,
  ingestPaper,
  isOpenFullTextLicense,
  MAX_CANDIDATE_ATTEMPTS,
  type PaperIngestDeps,
  type PaperIngestInput,
  PDF_ATTEMPT_RESERVE_MS,
} from "./paperIngest";

const longText = Array.from({ length: 2_000 }, (_, i) => `w${i}`).join(" ");
/** OCR of a real paper: long enough to pass the open-access PDF length floor. */
const OCR_TEXT = `OCR ${longText}`;
const pdfBytes = new TextEncoder().encode("%PDF-1.7") as Uint8Array<ArrayBuffer>;

const input = (over: Partial<PaperIngestInput> = {}): PaperIngestInput => ({
  title: "Nanometre-scale thermometry",
  paperRecord: {
    abstract: "Short abstract.",
    authors: ["Kucsko, G."],
    doi: "10.1038/nature12373",
    isOa: true,
  },
  fileUrl: "https://doi.org/10.1038/nature12373",
  ...over,
});

const candidate = (over: Partial<OaCandidate> = {}): OaCandidate => ({
  url: "https://arxiv.org/pdf/1304.1068",
  kind: "pdf",
  version: "submittedVersion",
  host: "arxiv.org",
  ...over,
});

function makeDeps(over: Partial<PaperIngestDeps> = {}): PaperIngestDeps {
  return {
    resolveCandidates: vi.fn().mockResolvedValue([]),
    fetchCandidate: vi.fn().mockResolvedValue({ type: "unusable", reason: "HTTP 403" }),
    attachPdf: vi.fn().mockResolvedValue("storage_new"),
    detachPdf: vi.fn().mockResolvedValue(undefined),
    ocrStoredPdf: vi.fn().mockResolvedValue(OCR_TEXT),
    scrape: vi.fn().mockResolvedValue({ title: "Page", content: "too short" }),
    now: () => 0,
    ...over,
  };
}

const logger = { info: vi.fn(), warn: vi.fn() };

describe("ingestPaper", () => {
  it("OCRs a stored PDF first and keeps its recorded source", async () => {
    const deps = makeDeps();
    const out = await ingestPaper(
      input({ storageId: "storage_1", fullTextSource: { method: "oa_pdf", host: "arxiv.org" } }),
      deps,
      logger
    );
    expect(out).toEqual({
      outcome: "full_text",
      content: OCR_TEXT,
      fullTextSource: { method: "oa_pdf", host: "arxiv.org" },
    });
    expect(deps.ocrStoredPdf).toHaveBeenCalledWith("storage_1");
    expect(deps.resolveCandidates).not.toHaveBeenCalled();
  });

  it("records a stored PDF with no recorded source as uploaded", async () => {
    const out = await ingestPaper(input({ storageId: "storage_1" }), makeDeps(), logger);
    expect(out).toMatchObject({ outcome: "full_text", fullTextSource: { method: "uploaded_pdf" } });
  });

  it("stores and OCRs the first open-access PDF", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([candidate({ license: "cc-by" })]),
      fetchCandidate: vi.fn().mockResolvedValue({
        type: "pdf",
        bytes: pdfBytes,
        finalUrl: "https://arxiv.org/pdf/1304.1068",
      }),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(deps.resolveCandidates).toHaveBeenCalledWith({
      doi: "10.1038/nature12373",
      openAlexId: undefined,
      pdfUrl: undefined,
    });
    expect(deps.attachPdf).toHaveBeenCalledWith(pdfBytes);
    expect(deps.ocrStoredPdf).toHaveBeenCalledWith("storage_new");
    expect(out).toEqual({
      outcome: "full_text",
      content: OCR_TEXT,
      fullTextSource: {
        method: "oa_pdf",
        url: "https://arxiv.org/pdf/1304.1068",
        version: "submittedVersion",
        license: "cc-by",
        host: "arxiv.org",
      },
    });
  });

  it("deletes a stored candidate PDF whose OCR fails, then tries the next candidate", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([
        candidate({ url: "https://a.example/1.pdf", host: "a.example" }),
        candidate({
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/",
          kind: "html",
          host: "pmc.ncbi.nlm.nih.gov",
        }),
      ]),
      fetchCandidate: vi
        .fn()
        .mockResolvedValueOnce({
          type: "pdf",
          bytes: pdfBytes,
          finalUrl: "https://a.example/1.pdf",
        })
        .mockResolvedValueOnce({
          type: "html",
          finalUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/",
        }),
      ocrStoredPdf: vi.fn().mockResolvedValue("   "),
      scrape: vi.fn().mockResolvedValue({ title: "PMC article", content: longText }),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(deps.detachPdf).toHaveBeenCalledWith("storage_new");
    expect(out).toMatchObject({
      outcome: "full_text",
      content: longText,
      title: "PMC article",
      fullTextSource: { method: "oa_html", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/" },
    });
  });

  it("scrapes a PDF URL that served HTML, and rejects it when it's abstract-sized", async () => {
    const deps = makeDeps({
      resolveCandidates: vi
        .fn()
        .mockResolvedValue([candidate({ url: "https://journal.example/a.pdf" })]),
      fetchCandidate: vi
        .fn()
        .mockResolvedValue({ type: "html", finalUrl: "https://journal.example/a" }),
      scrape: vi.fn().mockResolvedValue({ title: "Paywall", content: "Buy this article" }),
    });
    const out = await ingestPaper(input({ fileUrl: undefined }), deps, logger);
    expect(deps.scrape).toHaveBeenCalledWith("https://journal.example/a");
    expect(out.outcome).toBe("abstract_only");
  });

  it("stops after the attempt limit", async () => {
    const many = Array.from({ length: MAX_CANDIDATE_ATTEMPTS + 3 }, (_, i) =>
      candidate({ url: `https://m.example/${i}.pdf`, host: "m.example" })
    );
    const deps = makeDeps({ resolveCandidates: vi.fn().mockResolvedValue(many) });
    await ingestPaper(input({ fileUrl: undefined }), deps, logger);
    expect(deps.fetchCandidate).toHaveBeenCalledTimes(MAX_CANDIDATE_ATTEMPTS);
  });

  it("stops when the time budget is spent", async () => {
    let t = 0;
    const deps = makeDeps({
      resolveCandidates: vi
        .fn()
        .mockResolvedValue([candidate(), candidate({ url: "https://b.example/2.pdf" })]),
      fetchCandidate: vi.fn().mockImplementation(async () => {
        t += INGEST_DEADLINE_MS;
        return { type: "unusable", reason: "slow" };
      }),
      now: () => t,
    });
    await ingestPaper(input({ fileUrl: undefined }), deps, logger);
    expect(deps.fetchCandidate).toHaveBeenCalledTimes(1);
  });

  it("accepts a long landing page when no candidate works", async () => {
    const deps = makeDeps({
      scrape: vi.fn().mockResolvedValue({ title: "Article", content: longText }),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(deps.scrape).toHaveBeenCalledWith("https://doi.org/10.1038/nature12373");
    expect(out).toMatchObject({
      outcome: "full_text",
      fullTextSource: {
        method: "landing_page",
        url: "https://doi.org/10.1038/nature12373",
        host: "doi.org",
      },
    });
  });

  it("doesn't scrape the landing page twice when it was already a candidate", async () => {
    const deps = makeDeps({
      resolveCandidates: vi
        .fn()
        .mockResolvedValue([
          candidate({ url: "https://doi.org/10.1038/nature12373", kind: "html", host: "doi.org" }),
        ]),
      fetchCandidate: vi
        .fn()
        .mockResolvedValue({ type: "html", finalUrl: "https://doi.org/10.1038/nature12373" }),
    });
    await ingestPaper(input(), deps, logger);
    expect(deps.scrape).toHaveBeenCalledTimes(1);
  });

  it("falls back to the abstract stub, surviving thrown OCR and scrape errors", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([candidate()]),
      fetchCandidate: vi.fn().mockResolvedValue({ type: "pdf", bytes: pdfBytes, finalUrl: "x" }),
      ocrStoredPdf: vi
        .fn()
        .mockRejectedValue(new ExternalServiceError("mistral", "Bad PDF", { statusCode: 400 })),
      scrape: vi.fn().mockRejectedValue(new Error("Supadata down")),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(out.outcome).toBe("abstract_only");
    expect(out.content).toContain("## Abstract");
    expect(out.content).toContain("Short abstract.");
    expect(out.content).toContain("Full text was not ingested");
  });

  it("rejects an open-access PDF too short to be the paper, and deletes it", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([candidate()]),
      fetchCandidate: vi.fn().mockResolvedValue({ type: "pdf", bytes: pdfBytes, finalUrl: "x" }),
      ocrStoredPdf: vi.fn().mockResolvedValue("This article is available on request."),
    });
    const out = await ingestPaper(input({ fileUrl: undefined }), deps, logger);
    expect(deps.detachPdf).toHaveBeenCalledWith("storage_new");
    expect(out.outcome).toBe("abstract_only");
  });

  it.each([
    ["a 503", new ExternalServiceError("mistral", "Mistral 503", { statusCode: 503 })],
    ["a timeout", new Error("Mistral OCR request timed out")],
  ])("rethrows %s on an open-access PDF's OCR after deleting it", async (_label, error) => {
    const deps = makeDeps({
      resolveCandidates: vi
        .fn()
        .mockResolvedValue([candidate(), candidate({ url: "https://b/2" })]),
      fetchCandidate: vi.fn().mockResolvedValue({ type: "pdf", bytes: pdfBytes, finalUrl: "x" }),
      ocrStoredPdf: vi.fn().mockRejectedValue(error),
    });
    await expect(ingestPaper(input(), deps, logger)).rejects.toThrow(error.message);
    expect(deps.detachPdf).toHaveBeenCalledWith("storage_new");
    expect(deps.fetchCandidate).toHaveBeenCalledTimes(1);
  });

  describe("a stored PDF", () => {
    it("rethrows a timed-out OCR of the stored PDF", async () => {
      const deps = makeDeps({
        ocrStoredPdf: vi.fn().mockRejectedValue(new Error("Mistral OCR request timed out")),
        resolveCandidates: vi.fn().mockResolvedValue([candidate()]),
      });
      await expect(ingestPaper(input({ storageId: "storage_1" }), deps, logger)).rejects.toThrow(
        "timed out"
      );
      expect(deps.attachPdf).not.toHaveBeenCalled();
    });

    it("rethrows a transient OCR error on the stored PDF, without touching storage", async () => {
      const deps = makeDeps({
        ocrStoredPdf: vi
          .fn()
          .mockRejectedValue(
            new ExternalServiceError("mistral", "Mistral 503", { statusCode: 503 })
          ),
        resolveCandidates: vi.fn().mockResolvedValue([candidate()]),
      });
      await expect(ingestPaper(input({ storageId: "storage_1" }), deps, logger)).rejects.toThrow(
        "Mistral 503"
      );
      expect(deps.attachPdf).not.toHaveBeenCalled();
      expect(deps.detachPdf).not.toHaveBeenCalled();
    });

    it.each([
      [
        "a 4xx from the OCR service",
        new ExternalServiceError("mistral", "Bad PDF", { statusCode: 400 }),
      ],
      ["a missing stored file", new Error("Stored PDF not found")],
    ])("lets an open-access PDF replace a stored PDF that fails with %s", async (_label, error) => {
      const deps = makeDeps({
        ocrStoredPdf: vi.fn().mockImplementation(async (id: string) => {
          if (id === "storage_1") throw error;
          return OCR_TEXT;
        }),
        resolveCandidates: vi.fn().mockResolvedValue([candidate()]),
        fetchCandidate: vi.fn().mockResolvedValue({
          type: "pdf",
          bytes: pdfBytes,
          finalUrl: "https://arxiv.org/pdf/1304.1068",
        }),
      });
      const out = await ingestPaper(
        input({ storageId: "storage_1", fileUrl: undefined }),
        deps,
        logger
      );
      expect(deps.attachPdf).toHaveBeenCalledWith(pdfBytes);
      expect(out).toMatchObject({
        outcome: "full_text",
        content: OCR_TEXT,
        fullTextSource: { method: "oa_pdf" },
      });
    });

    it("ends abstract-only when a permanently unreadable stored PDF has no replacement", async () => {
      const deps = makeDeps({
        ocrStoredPdf: vi.fn().mockRejectedValue(new Error("Stored PDF not found")),
      });
      const out = await ingestPaper(
        input({ storageId: "storage_1", fileUrl: undefined }),
        deps,
        logger
      );
      expect(deps.detachPdf).not.toHaveBeenCalled();
      expect(out.outcome).toBe("abstract_only");
    });

    it("still scrapes the landing page after a permanent OCR error on the stored PDF", async () => {
      const deps = makeDeps({
        ocrStoredPdf: vi.fn().mockRejectedValue(new Error("Stored PDF not found")),
        scrape: vi.fn().mockResolvedValue({ title: "Article", content: longText }),
      });
      const out = await ingestPaper(input({ storageId: "storage_1" }), deps, logger);
      expect(out).toMatchObject({
        outcome: "full_text",
        fullTextSource: { method: "landing_page" },
      });
    });

    it("tries PDF candidates when the stored PDF has no text, and the copy replaces it", async () => {
      const deps = makeDeps({
        ocrStoredPdf: vi
          .fn()
          .mockImplementation(async (id: string) => (id === "storage_1" ? "  " : OCR_TEXT)),
        resolveCandidates: vi
          .fn()
          .mockResolvedValue([candidate({ url: "https://a.example/1.pdf", host: "a.example" })]),
        fetchCandidate: vi
          .fn()
          .mockResolvedValue({ type: "pdf", bytes: pdfBytes, finalUrl: "https://a.example/1.pdf" }),
      });
      const out = await ingestPaper(input({ storageId: "storage_1" }), deps, logger);
      expect(deps.attachPdf).toHaveBeenCalledTimes(1);
      expect(out).toMatchObject({ outcome: "full_text", fullTextSource: { method: "oa_pdf" } });
    });

    it("uses a PDF that an HTML candidate serves when the stored PDF is empty", async () => {
      const deps = makeDeps({
        ocrStoredPdf: vi
          .fn()
          .mockImplementation(async (id: string) => (id === "storage_1" ? "" : OCR_TEXT)),
        resolveCandidates: vi
          .fn()
          .mockResolvedValue([candidate({ url: "https://a.example/view", kind: "html" })]),
        fetchCandidate: vi
          .fn()
          .mockResolvedValue({ type: "pdf", bytes: pdfBytes, finalUrl: "https://a.example/x.pdf" }),
      });
      const out = await ingestPaper(
        input({ storageId: "storage_1", fileUrl: undefined }),
        deps,
        logger
      );
      expect(deps.attachPdf).toHaveBeenCalledTimes(1);
      expect(out).toMatchObject({ outcome: "full_text", fullTextSource: { method: "oa_pdf" } });
    });

    it("records a stored PDF with a stale non-PDF source as uploaded", async () => {
      const out = await ingestPaper(
        input({
          storageId: "storage_1",
          fullTextSource: { method: "oa_html", url: "https://pmc.example/a" },
        }),
        makeDeps(),
        logger
      );
      expect(out).toMatchObject({
        outcome: "full_text",
        fullTextSource: { method: "uploaded_pdf" },
      });
    });
  });

  describe("deadline", () => {
    it("skips a PDF candidate that no longer fits but still tries an HTML one", async () => {
      let t = 0;
      const deps = makeDeps({
        // Candidate lookup eats most of the deadline: HTML still fits, PDF no longer does.
        resolveCandidates: vi.fn().mockImplementation(async () => {
          t += INGEST_DEADLINE_MS - PDF_ATTEMPT_RESERVE_MS + 1;
          return [
            candidate({ url: "https://a.example/1.pdf", host: "a.example" }),
            candidate({ url: "https://pmc.example/a/", kind: "html", host: "pmc.example" }),
          ];
        }),
        fetchCandidate: vi
          .fn()
          .mockResolvedValue({ type: "html", finalUrl: "https://pmc.example/a/" }),
        scrape: vi.fn().mockResolvedValue({ title: "A", content: longText }),
        now: () => t,
      });
      expect(PDF_ATTEMPT_RESERVE_MS).toBeGreaterThan(HTML_ATTEMPT_RESERVE_MS);
      const out = await ingestPaper(input({ fileUrl: undefined }), deps, logger);
      expect(deps.fetchCandidate).toHaveBeenCalledTimes(1);
      expect(deps.fetchCandidate).toHaveBeenCalledWith("https://pmc.example/a/");
      expect(out).toMatchObject({ outcome: "full_text", fullTextSource: { method: "oa_html" } });
    });

    it("doesn't count skipped candidates as attempts", async () => {
      let t = 0;
      const pdfs = Array.from({ length: MAX_CANDIDATE_ATTEMPTS + 2 }, (_, i) =>
        candidate({ url: `https://m.example/${i}.pdf`, host: "m.example" })
      );
      const html = candidate({ url: "https://pmc.example/a/", kind: "html", host: "pmc.example" });
      const deps = makeDeps({
        resolveCandidates: vi.fn().mockImplementation(async () => {
          t += INGEST_DEADLINE_MS - PDF_ATTEMPT_RESERVE_MS + 1;
          return [...pdfs, html];
        }),
        fetchCandidate: vi
          .fn()
          .mockResolvedValue({ type: "html", finalUrl: "https://pmc.example/a/" }),
        scrape: vi.fn().mockResolvedValue({ title: "A", content: longText }),
        now: () => t,
      });
      const out = await ingestPaper(input({ fileUrl: undefined }), deps, logger);
      expect(out.outcome).toBe("full_text");
    });

    it("doesn't store a fetched PDF when there's no time left to OCR it", async () => {
      let t = 0;
      const deps = makeDeps({
        resolveCandidates: vi
          .fn()
          .mockResolvedValue([candidate({ url: "https://a.example/view", kind: "html" })]),
        fetchCandidate: vi.fn().mockImplementation(async () => {
          t += 250_000;
          return { type: "pdf", bytes: pdfBytes, finalUrl: "https://a.example/x.pdf" };
        }),
        now: () => t,
      });
      const out = await ingestPaper(input({ fileUrl: undefined }), deps, logger);
      expect(deps.attachPdf).not.toHaveBeenCalled();
      expect(out.outcome).toBe("abstract_only");
    });

    it("skips the landing page when too little time is left", async () => {
      let t = 0;
      const deps = makeDeps({
        resolveCandidates: vi.fn().mockImplementation(async () => {
          t += INGEST_DEADLINE_MS - 59_999;
          return [];
        }),
        scrape: vi.fn().mockResolvedValue({ title: "Article", content: longText }),
        now: () => t,
      });
      const out = await ingestPaper(input(), deps, logger);
      expect(deps.scrape).not.toHaveBeenCalled();
      expect(out.outcome).toBe("abstract_only");
    });

    it("counts a time-consuming stored-PDF step against the deadline", async () => {
      let t = 0;
      const deps = makeDeps({
        ocrStoredPdf: vi.fn().mockImplementation(async () => {
          t += INGEST_DEADLINE_MS - 59_999;
          return "";
        }),
        scrape: vi.fn().mockResolvedValue({ title: "Article", content: longText }),
        now: () => t,
      });
      const out = await ingestPaper(input({ storageId: "storage_1" }), deps, logger);
      expect(deps.scrape).not.toHaveBeenCalled();
      expect(out.outcome).toBe("abstract_only");
    });

    it("measures the deadline from the start of the ingest", async () => {
      const deps = makeDeps({
        resolveCandidates: vi.fn().mockResolvedValue([candidate()]),
        fetchCandidate: vi.fn().mockResolvedValue({ type: "unusable", reason: "x" }),
        now: () => 1_000_000,
      });
      await ingestPaper(input({ fileUrl: undefined }), deps, logger);
      expect(deps.fetchCandidate).toHaveBeenCalledTimes(1);
    });
  });

  describe("resilience", () => {
    it("falls through to the landing page when candidate lookup throws", async () => {
      const deps = makeDeps({
        resolveCandidates: vi.fn().mockRejectedValue(new Error("Unpaywall down")),
        scrape: vi.fn().mockResolvedValue({ title: "Article", content: longText }),
      });
      const out = await ingestPaper(input(), deps, logger);
      expect(out).toMatchObject({
        outcome: "full_text",
        fullTextSource: { method: "landing_page" },
      });
    });

    it("treats a throwing fetch as unusable and carries on", async () => {
      const deps = makeDeps({
        resolveCandidates: vi
          .fn()
          .mockResolvedValue([
            candidate({ url: "https://a.example/1.pdf", host: "a.example" }),
            candidate({ url: "https://b.example/2.pdf", host: "b.example" }),
          ]),
        fetchCandidate: vi
          .fn()
          .mockRejectedValueOnce(new Error("socket hang up"))
          .mockResolvedValueOnce({
            type: "pdf",
            bytes: pdfBytes,
            finalUrl: "https://b.example/2.pdf",
          }),
      });
      const out = await ingestPaper(input(), deps, logger);
      expect(deps.fetchCandidate).toHaveBeenCalledTimes(2);
      expect(out).toMatchObject({ outcome: "full_text", fullTextSource: { method: "oa_pdf" } });
    });

    it("continues to the next candidate when storing a PDF fails", async () => {
      const deps = makeDeps({
        resolveCandidates: vi
          .fn()
          .mockResolvedValue([
            candidate({ url: "https://a.example/1.pdf", host: "a.example" }),
            candidate({ url: "https://b.example/2.pdf", host: "b.example" }),
          ]),
        fetchCandidate: vi.fn().mockImplementation(async (url: string) => ({
          type: "pdf",
          bytes: pdfBytes,
          finalUrl: url,
        })),
        attachPdf: vi
          .fn()
          .mockRejectedValueOnce(new Error("storage 500"))
          .mockResolvedValueOnce("storage_ok"),
      });
      const out = await ingestPaper(input(), deps, logger);
      expect(deps.attachPdf).toHaveBeenCalledTimes(2);
      expect(deps.ocrStoredPdf).toHaveBeenCalledWith("storage_ok");
      expect(out).toMatchObject({
        outcome: "full_text",
        fullTextSource: { url: "https://b.example/2.pdf" },
      });
    });

    it("swallows a failed delete of an unreadable PDF", async () => {
      const deps = makeDeps({
        resolveCandidates: vi.fn().mockResolvedValue([candidate()]),
        fetchCandidate: vi.fn().mockResolvedValue({ type: "pdf", bytes: pdfBytes, finalUrl: "x" }),
        ocrStoredPdf: vi.fn().mockResolvedValue(""),
        detachPdf: vi.fn().mockRejectedValue(new Error("delete failed")),
      });
      const out = await ingestPaper(input({ fileUrl: undefined }), deps, logger);
      expect(deps.detachPdf).toHaveBeenCalledWith("storage_new");
      expect(out.outcome).toBe("abstract_only");
    });
  });

  describe("landing page", () => {
    it("uses the record's landing page when there is no file URL", async () => {
      const deps = makeDeps({
        scrape: vi.fn().mockResolvedValue({ title: "Article", content: longText }),
      });
      const out = await ingestPaper(
        input({
          fileUrl: undefined,
          paperRecord: {
            abstract: "Short abstract.",
            landingPageUrl: "https://journal.example/article/1",
          },
        }),
        deps,
        logger
      );
      expect(deps.scrape).toHaveBeenCalledWith("https://journal.example/article/1");
      expect(out).toMatchObject({
        fullTextSource: { method: "landing_page", host: "journal.example" },
      });
    });

    it("doesn't re-scrape a landing page an earlier candidate redirected to", async () => {
      const deps = makeDeps({
        resolveCandidates: vi
          .fn()
          .mockResolvedValue([candidate({ url: "https://link.example/go/1", kind: "html" })]),
        fetchCandidate: vi
          .fn()
          .mockResolvedValue({ type: "html", finalUrl: "https://doi.org/10.1038/nature12373" }),
        scrape: vi.fn().mockResolvedValue({ title: "Paywall", content: "Buy this article" }),
      });
      await ingestPaper(input(), deps, logger);
      expect(deps.scrape).toHaveBeenCalledTimes(1);
    });

    it("treats scheme and trailing-slash variants of a tried URL as the same page", async () => {
      const deps = makeDeps({
        resolveCandidates: vi.fn().mockResolvedValue([
          candidate({
            url: "http://pmc.example/articles/PMC1",
            kind: "html",
            host: "pmc.example",
          }),
        ]),
        fetchCandidate: vi
          .fn()
          .mockResolvedValue({ type: "html", finalUrl: "http://pmc.example/articles/PMC1" }),
        scrape: vi.fn().mockResolvedValue({ title: "Short", content: "nope" }),
      });
      await ingestPaper(input({ fileUrl: "https://pmc.example/articles/PMC1/" }), deps, logger);
      expect(deps.scrape).toHaveBeenCalledTimes(1);
    });
  });

  it("takes an HTML result's host from the page it ended up on", async () => {
    const deps = makeDeps({
      resolveCandidates: vi
        .fn()
        .mockResolvedValue([
          candidate({ url: "https://doi.org/10.1/x", kind: "html", host: "doi.org" }),
        ]),
      fetchCandidate: vi
        .fn()
        .mockResolvedValue({ type: "html", finalUrl: "https://publisher.example/article/x" }),
      scrape: vi.fn().mockResolvedValue({ title: "Article", content: longText }),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(out).toMatchObject({
      fullTextSource: {
        method: "oa_html",
        url: "https://publisher.example/article/x",
        host: "publisher.example",
      },
    });
  });
});

describe("fulltextStatusAfterIngest", () => {
  it("is available after full text, keeps external_only, otherwise unavailable", () => {
    expect(fulltextStatusAfterIngest("full_text", "external_only")).toBe("available");
    expect(fulltextStatusAfterIngest("abstract_only", "external_only")).toBe("external_only");
    expect(fulltextStatusAfterIngest("abstract_only", "available")).toBe("unavailable");
    expect(fulltextStatusAfterIngest("abstract_only", undefined)).toBe("unavailable");
  });
});

describe("isOpenFullTextLicense", () => {
  it.each([
    ["cc-by", true],
    ["CC BY 4.0", true],
    ["cc-by-sa", true],
    ["cc0", true],
    ["public-domain", true],
    ["https://creativecommons.org/licenses/by/4.0/", true],
    ["http://creativecommons.org/publicdomain/zero/1.0/", true],
    ["cc-by-nc", false],
    ["cc-by-nc-nd", false],
    ["https://creativecommons.org/licenses/by-nc/4.0/", false],
    ["publisher-specific-oa", false],
    ["https://www.elsevier.com/tdm/userlicense/1.0/", false],
    [undefined, false],
  ])("%s → %s", (license, expected) => {
    expect(isOpenFullTextLicense(license)).toBe(expected);
  });
});

describe("open_license_only", () => {
  it("skips open-access copies without an open licence and never scrapes the landing page", async () => {
    const deps = makeDeps({
      resolveCandidates: vi
        .fn()
        .mockResolvedValue([
          candidate({ url: "https://a.example/1.pdf", host: "a.example", license: "cc-by-nc" }),
          candidate({ url: "https://b.example/2.pdf", host: "b.example" }),
        ]),
      scrape: vi.fn().mockResolvedValue({ title: "Landing", content: longText }),
    });
    const out = await ingestPaper(input({ fullTextPolicy: "open_license_only" }), deps, logger);
    expect(out.outcome).toBe("abstract_only");
    expect(deps.fetchCandidate).not.toHaveBeenCalled();
    expect(deps.scrape).not.toHaveBeenCalled();
  });

  it("keeps full text from a CC BY open-access PDF", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([candidate({ license: "cc-by" })]),
      fetchCandidate: vi.fn().mockResolvedValue({
        type: "pdf",
        bytes: pdfBytes,
        finalUrl: "https://arxiv.org/pdf/1304.1068",
      }),
    });
    const out = await ingestPaper(input({ fullTextPolicy: "open_license_only" }), deps, logger);
    expect(out).toMatchObject({
      outcome: "full_text",
      content: OCR_TEXT,
      fullTextSource: { method: "oa_pdf", license: "cc-by" },
    });
  });

  it("does not read a stored PDF whose licence is unknown", async () => {
    const deps = makeDeps();
    const out = await ingestPaper(
      input({ storageId: "storage_1", fullTextPolicy: "open_license_only" }),
      deps,
      logger
    );
    expect(deps.ocrStoredPdf).not.toHaveBeenCalled();
    expect(out.outcome).toBe("abstract_only");
  });

  it("without the policy, still scrapes the landing page", async () => {
    const deps = makeDeps({
      scrape: vi.fn().mockResolvedValue({ title: "Landing", content: longText }),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(out).toMatchObject({ outcome: "full_text", fullTextSource: { method: "landing_page" } });
  });
});
