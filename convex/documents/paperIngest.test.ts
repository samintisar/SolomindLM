import { describe, expect, it, vi } from "vitest";
import type { OaCandidate } from "../_services/extraction/openAccess/OpenAccessResolver";
import {
  CANDIDATE_BUDGET_MS,
  fulltextStatusAfterIngest,
  ingestPaper,
  MAX_CANDIDATE_ATTEMPTS,
  type PaperIngestDeps,
  type PaperIngestInput,
} from "./paperIngest";

const longText = Array.from({ length: 2_000 }, (_, i) => `w${i}`).join(" ");
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
    ocrStoredPdf: vi.fn().mockResolvedValue("OCR text"),
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
      content: "OCR text",
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
      content: "OCR text",
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
        t += CANDIDATE_BUDGET_MS;
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
      ocrStoredPdf: vi.fn().mockRejectedValue(new Error("Mistral 500")),
      scrape: vi.fn().mockRejectedValue(new Error("Supadata down")),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(out.outcome).toBe("abstract_only");
    expect(out.content).toContain("## Abstract");
    expect(out.content).toContain("Short abstract.");
    expect(out.content).toContain("Full text was not ingested");
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
